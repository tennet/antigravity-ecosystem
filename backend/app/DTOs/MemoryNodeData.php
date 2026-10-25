<?php

declare(strict_types=1);

namespace App\DTOs;

use App\Enums\EntityType;

/**
 * Immutable Data Transfer Object for MemoryNode operations.
 * Leverages PHP 8.4 typed properties.
 */
final readonly class MemoryNodeData
{
    /**
     * @param int $tenantId
     * @param string $entityType
     * @param string $label
     * @param array<string, mixed> $properties
     * @param list<float>|null $vectorEmbedding
     * @param string|null $uuid
     */
    public function __construct(
        public int $tenantId,
        public string $entityType,
        public string $label,
        public array $properties = [],
        public ?array $vectorEmbedding = null,
        public ?string $uuid = null,
    ) {}

    /**
     * Create DTO from validated HTTP request array.
     *
     * @param array<string, mixed> $validated
     * @return self
     */
    public static function fromArray(array $validated): self
    {
        $entityType = $validated['entity_type'] instanceof EntityType
            ? $validated['entity_type']->value
            : (string) $validated['entity_type'];

        /** @var array<string, mixed> $props */
        $props = $validated['properties'] ?? [];

        /** @var list<float>|null $embedding */
        $embedding = isset($validated['vector_embedding']) && is_array($validated['vector_embedding'])
            ? array_values(array_map('floatval', $validated['vector_embedding']))
            : null;

        return new self(
            tenantId: (int) $validated['tenant_id'],
            entityType: trim($entityType),
            label: trim((string) $validated['label']),
            properties: $props,
            vectorEmbedding: $embedding,
            uuid: isset($validated['uuid']) ? (string) $validated['uuid'] : null,
        );
    }
}
