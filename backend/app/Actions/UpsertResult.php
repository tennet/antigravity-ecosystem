<?php

declare(strict_types=1);

namespace App\Actions;

use App\Models\MemoryNode;
use App\Models\OutboxEvent;

/**
 * Result representation of an Upsert operation, including
 * optional Transactional Outbox event dispatched for vector embedding.
 */
final readonly class UpsertResult
{
    public function __construct(
        public MemoryNode $node,
        public bool $isDuplicate,
        public bool $wasUpdated,
        public string $checksum,
        public ?OutboxEvent $outboxEvent = null,
    ) {}
}
