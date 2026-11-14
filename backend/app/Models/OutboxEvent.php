<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\OutboxStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/**
 * OutboxEvent Model representing a transactional outbox message.
 *
 * @property int $id
 * @property string $uuid
 * @property int $tenant_id
 * @property string $event_type
 * @property string $aggregate_type
 * @property int $aggregate_id
 * @property array<string, mixed> $payload
 * @property string $status
 * @property int $retry_count
 * @property string|null $last_error
 * @property Carbon|null $processed_at
 * @property Carbon $created_at
 * @property Carbon $updated_at
 * @property-read Tenant $tenant
 * @property-read MemoryNode|null $memoryNode
 */
class OutboxEvent extends Model
{
    use HasFactory;

    public const string STATUS_PENDING = 'PENDING';
    public const string STATUS_PROCESSING = 'PROCESSING';
    public const string STATUS_COMPLETED = 'COMPLETED';
    public const string STATUS_FAILED = 'FAILED';

    public const string EVENT_MEMORY_NODE_EMBEDDING_REQUESTED = 'memory_node.embedding_requested';
    public const string AGGREGATE_MEMORY_NODE = 'memory_node';

    /**
     * @var list<string>
     */
    protected $fillable = [
        'uuid',
        'tenant_id',
        'event_type',
        'aggregate_type',
        'aggregate_id',
        'payload',
        'status',
        'retry_count',
        'last_error',
        'processed_at',
    ];

    /**
     * PHP 8.4 Property Hook: Check if event is currently pending.
     */
    public bool $isPending {
        get => $this->status === self::STATUS_PENDING;
    }

    /**
     * PHP 8.4 Property Hook: Check if event is currently in processing.
     */
    public bool $isProcessing {
        get => $this->status === self::STATUS_PROCESSING;
    }

    /**
     * PHP 8.4 Property Hook: Check if event has completed.
     */
    public bool $isCompleted {
        get => $this->status === self::STATUS_COMPLETED;
    }

    /**
     * PHP 8.4 Property Hook: Check if event has failed.
     */
    public bool $isFailed {
        get => $this->status === self::STATUS_FAILED;
    }

    /**
     * Native Laravel 11/13 type casting declaration.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'tenant_id' => 'integer',
            'aggregate_id' => 'integer',
            'payload' => 'array',
            'status' => 'string',
            'retry_count' => 'integer',
            'processed_at' => 'datetime',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    /**
     * Model boot lifecycle events.
     */
    protected static function booted(): void
    {
        static::creating(function (OutboxEvent $event): void {
            if (empty($event->uuid)) {
                $event->uuid = (string) Str::uuid();
            }
            if (empty($event->status)) {
                $event->status = self::STATUS_PENDING;
            }
            if (!isset($event->retry_count)) {
                $event->retry_count = 0;
            }
        });
    }

    /**
     * Tenant to which this outbox event belongs.
     *
     * @return BelongsTo<Tenant, $this>
     */
    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class, 'tenant_id');
    }

    /**
     * Associated memory node if aggregate_type is memory_node.
     *
     * @return BelongsTo<MemoryNode, $this>
     */
    public function memoryNode(): BelongsTo
    {
        return $this->belongsTo(MemoryNode::class, 'aggregate_id');
    }

    /**
     * Local scope for FIFO worker polling of pending events.
     *
     * @param Builder<$this> $query
     * @return Builder<$this>
     */
    public function scopePending(Builder $query): Builder
    {
        return $query->where($this->qualifyColumn('status'), self::STATUS_PENDING)
            ->oldest('created_at');
    }

    /**
     * Local scope for strict multi-tenant boundary isolation.
     *
     * @param Builder<$this> $query
     * @param int $tenantId
     * @return Builder<$this>
     */
    public function scopeForTenant(Builder $query, int $tenantId): Builder
    {
        return $query->where($this->qualifyColumn('tenant_id'), $tenantId);
    }

    /**
     * Local scope for filtering by aggregate entity.
     *
     * @param Builder<$this> $query
     * @param string $aggregateType
     * @param int $aggregateId
     * @return Builder<$this>
     */
    public function scopeForAggregate(Builder $query, string $aggregateType, int $aggregateId): Builder
    {
        return $query->where($this->qualifyColumn('aggregate_type'), $aggregateType)
            ->where($this->qualifyColumn('aggregate_id'), $aggregateId);
    }

    /**
     * Mark event as in processing by background worker.
     */
    public function markAsProcessing(): void
    {
        $this->status = self::STATUS_PROCESSING;
        $this->save();
    }

    /**
     * Mark event as successfully processed and completed.
     */
    public function markAsCompleted(): void
    {
        $this->status = self::STATUS_COMPLETED;
        $this->processed_at = Carbon::now();
        $this->save();
    }

    /**
     * Record worker failure, increment retry counter, and update error text.
     */
    public function markAsFailed(string $error): void
    {
        $this->status = self::STATUS_FAILED;
        $this->last_error = $error;
        $this->retry_count++;
        $this->save();
    }
}
