<?php

declare(strict_types=1);

namespace App\Actions;

use App\DTOs\MemoryNodeData;
use App\Models\MemoryNode;
use App\Models\OutboxEvent;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Action: Upsert Memory Node with atomic ACID isolation,
 * deterministic SHA-256 deduplication, Gap-Lock elimination, full-jitter retry,
 * and Transactional Outbox event dispatching for vector embeddings.
 */
final class UpsertMemoryNodeAction
{
    /**
     * Max transaction retry attempts on database deadlocks.
     */
    public const int TRANSACTION_MAX_ATTEMPTS = 5;

    /**
     * Maximum allowed nesting depth for node properties (anti-DoS / stack exhaustion).
     */
    public const int MAX_PROPERTIES_DEPTH = 5;

    /**
     * Execute the atomic upsert with exponential backoff and full jitter.
     *
     * @param MemoryNodeData $data
     * @return UpsertResult
     *
     * @throws \Throwable If unrecoverable database or serialization failure occurs.
     */
    public function execute(MemoryNodeData $data): UpsertResult
    {
        $checksum = $this->calculateChecksum(
            tenantId: $data->tenantId,
            entityType: $data->entityType,
            label: $data->label,
            properties: $data->properties
        );

        $maxAttempts = self::TRANSACTION_MAX_ATTEMPTS;

        for ($attempt = 1; $attempt <= $maxAttempts; $attempt++) {
            try {
                return DB::transaction(
                    callback: fn (): UpsertResult => $this->upsertWithinTransaction($data, $checksum)
                );
            } catch (\Throwable $e) {
                if ($this->isDeadlockOrLockTimeout($e) && $attempt < $maxAttempts) {
                    // Exponential backoff with full jitter (Decorrelated Jitter algorithm)
                    // Base: 15ms, Cap: 250ms
                    $capMs = 250;
                    $temp = min($capMs, 15 * (2 ** ($attempt - 1)));
                    $sleepMs = random_int(0, $temp);

                    Log::warning("Database concurrency lock conflict detected (attempt {$attempt}/{$maxAttempts}). Retrying in {$sleepMs}ms...", [
                        'tenant_id' => $data->tenantId,
                        'checksum' => $checksum,
                        'error' => $e->getMessage(),
                    ]);

                    usleep($sleepMs * 1000);
                    continue;
                }

                throw $e;
            }
        }

        throw new \RuntimeException('Exceeded maximum retry attempts for memory node upsert.');
    }

    /**
     * Core atomic upsert routine executed within the transaction.
     * Prevents InnoDB Gap-Lock deadlocks by avoiding SELECT FOR UPDATE on non-existent records,
     * and atomically emits an OutboxEvent whenever embedding generation is required.
     */
    private function upsertWithinTransaction(MemoryNodeData $data, string $checksum): UpsertResult
    {
        // 1. Non-locking point-lookup to determine if row already exists
        /** @var MemoryNode|null $existingNode */
        $existingNode = MemoryNode::query()
            ->where('tenant_id', $data->tenantId)
            ->where('checksum_sha256', $checksum)
            ->first();

        if ($existingNode !== null) {
            // Lock ONLY the existing row by primary key (Record Lock, NOT Gap Lock!)
            /** @var MemoryNode $lockedNode */
            $lockedNode = MemoryNode::query()
                ->where('id', $existingNode->id)
                ->lockForUpdate()
                ->firstOrFail();

            $wasUpdated = false;

            // Update vector embedding if new embedding is supplied and differs
            if ($data->vectorEmbedding !== null && $lockedNode->vector_embedding !== $data->vectorEmbedding) {
                $lockedNode->vector_embedding = $data->vectorEmbedding;
                $lockedNode->save();
                $wasUpdated = true;
            }

            // Transactional Outbox: If the existing node lacks a vector embedding,
            // dispatch an outbox event to compute it asynchronously.
            $outboxEvent = null;
            if (empty($lockedNode->vector_embedding)) {
                $outboxEvent = $this->createOutboxEvent($lockedNode);
            }

            return new UpsertResult(
                node: $lockedNode,
                isDuplicate: true,
                wasUpdated: $wasUpdated,
                checksum: $checksum,
                outboxEvent: $outboxEvent,
            );
        }

        // 2. Row does not exist: Attempt direct atomic insert
        try {
            $newNode = new MemoryNode([
                'tenant_id' => $data->tenantId,
                'entity_type' => $data->entityType,
                'label' => $data->label,
                'properties' => $data->properties,
                'vector_embedding' => $data->vectorEmbedding,
                'checksum_sha256' => $checksum,
            ]);

            if ($data->uuid !== null) {
                $newNode->uuid = $data->uuid;
            }

            $newNode->save();

            // Transactional Outbox:
            // When a new MemoryNode is created without a vector embedding,
            // dispatch an outbox event to request vector embedding generation.
            $outboxEvent = null;
            if (empty($newNode->vector_embedding)) {
                $outboxEvent = $this->createOutboxEvent($newNode);
            }

            return new UpsertResult(
                node: $newNode,
                isDuplicate: false,
                wasUpdated: false,
                checksum: $checksum,
                outboxEvent: $outboxEvent,
            );
        } catch (QueryException $e) {
            // Catch concurrent duplicate key race condition (MySQL 1062 / SQLSTATE 23000)
            if ($this->isDuplicateKeyException($e)) {
                Log::info('Concurrent insert caught duplicate constraint, resolving existing record.', [
                    'tenant_id' => $data->tenantId,
                    'checksum' => $checksum,
                ]);

                /** @var MemoryNode $recoveredNode */
                $recoveredNode = MemoryNode::query()
                    ->where('tenant_id', $data->tenantId)
                    ->where('checksum_sha256', $checksum)
                    ->firstOrFail();

                $wasUpdated = false;

                // Lock the record by primary key if embedding update needed
                if ($data->vectorEmbedding !== null && $recoveredNode->vector_embedding !== $data->vectorEmbedding) {
                    $locked = MemoryNode::query()->where('id', $recoveredNode->id)->lockForUpdate()->firstOrFail();
                    $locked->vector_embedding = $data->vectorEmbedding;
                    $locked->save();
                    $recoveredNode = $locked;
                    $wasUpdated = true;
                }

                $outboxEvent = null;
                if (empty($recoveredNode->vector_embedding)) {
                    $outboxEvent = $this->createOutboxEvent($recoveredNode);
                }

                return new UpsertResult(
                    node: $recoveredNode,
                    isDuplicate: true,
                    wasUpdated: $wasUpdated,
                    checksum: $checksum,
                    outboxEvent: $outboxEvent,
                );
            }

            throw $e;
        }
    }

    /**
     * Create an atomic outbox event for asynchronous vector embedding generation.
     * Executed strictly inside the active database transaction.
     *
     * @param MemoryNode $node
     * @return OutboxEvent
     */
    private function createOutboxEvent(MemoryNode $node): OutboxEvent
    {
        return OutboxEvent::create([
            'tenant_id' => $node->tenant_id,
            'event_type' => OutboxEvent::EVENT_MEMORY_NODE_EMBEDDING_REQUESTED,
            'aggregate_type' => OutboxEvent::AGGREGATE_MEMORY_NODE,
            'aggregate_id' => $node->id,
            'payload' => [
                'node_id' => $node->id,
                'uuid' => $node->uuid,
                'tenant_id' => $node->tenant_id,
                'entity_type' => $node->entity_type,
                'label' => $node->label,
                'properties' => $node->properties,
                'checksum_sha256' => $node->checksum_sha256,
            ],
            'status' => OutboxEvent::STATUS_PENDING,
            'retry_count' => 0,
        ]);
    }

    /**
     * Compute deterministic SHA-256 checksum over canonicalized node payload.
     * Guarantees identical hash regardless of property key insertion order.
     *
     * @param int $tenantId
     * @param string $entityType
     * @param string $label
     * @param array<string, mixed> $properties
     * @return string 64-character lowercase hex string
     */
    public function calculateChecksum(
        int $tenantId,
        string $entityType,
        string $label,
        array $properties
    ): string {
        $canonicalProperties = $this->canonicalizeArray($properties);

        $payload = [
            'tenant_id' => $tenantId,
            'entity_type' => strtolower(trim($entityType)),
            'label' => trim($label),
            'properties' => $canonicalProperties,
        ];

        $json = json_encode(
            $payload,
            JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
        );

        return hash('sha256', $json);
    }

    /**
     * Recursively sort array keys to generate deterministic canonical JSON.
     * Defends against recursion stack exhaustion DoS by enforcing a strict depth ceiling.
     *
     * @param array<string|int, mixed> $array
     * @param int $depth
     * @return array<string|int, mixed>
     */
    private function canonicalizeArray(array $array, int $depth = 0): array
    {
        if ($depth >= self::MAX_PROPERTIES_DEPTH) {
            throw new \InvalidArgumentException(
                "Properties nesting level exceeds maximum permitted depth (" . self::MAX_PROPERTIES_DEPTH . ")."
            );
        }

        foreach ($array as $key => $value) {
            if (is_array($value)) {
                $array[$key] = $this->canonicalizeArray($value, $depth + 1);
            }
        }

        // Sort associative array by key; numeric lists maintain their order
        if (!array_is_list($array)) {
            ksort($array);
        }

        return $array;
    }

    /**
     * Check if the QueryException corresponds to a unique key constraint violation.
     */
    private function isDuplicateKeyException(QueryException $e): bool
    {
        $errorCode = (string) $e->getCode();
        return $errorCode === '23000' || str_contains($e->getMessage(), '1062');
    }

    /**
     * Detect deadlock or lock wait timeout exceptions across MySQL and SQLite.
     */
    private function isDeadlockOrLockTimeout(\Throwable $e): bool
    {
        $msg = $e->getMessage();
        return str_contains($msg, '1213') ||
               str_contains($msg, 'Deadlock found') ||
               str_contains($msg, '1205') ||
               str_contains($msg, 'Lock wait timeout') ||
               str_contains($msg, 'database is locked');
    }
}
