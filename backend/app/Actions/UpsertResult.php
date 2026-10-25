<?php

declare(strict_types=1);

namespace App\Actions;

use App\Models\MemoryNode;

/**
 * Result representation of an Upsert operation.
 */
final readonly class UpsertResult
{
    public function __construct(
        public MemoryNode $node,
        public bool $isDuplicate,
        public bool $wasUpdated,
        public string $checksum,
    ) {}
}
