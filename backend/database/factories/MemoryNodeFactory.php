<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Actions\UpsertMemoryNodeAction;
use App\Enums\EntityType;
use App\Models\MemoryNode;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<MemoryNode>
 */
class MemoryNodeFactory extends Factory
{
    protected $model = MemoryNode::class;

    public function definition(): array
    {
        $tenantId = Tenant::factory();
        $entityType = fake()->randomElement(EntityType::values());
        $label = fake()->words(3, true);
        $properties = [
            'author' => fake()->name(),
            'confidence' => fake()->randomFloat(2, 0.5, 1.0),
            'tags' => [fake()->word(), fake()->word()],
        ];

        $action = new UpsertMemoryNodeAction();
        $checksum = $action->calculateChecksum(
            tenantId: 1, // Placeholder, dynamically recomputed on configure
            entityType: $entityType,
            label: $label,
            properties: $properties
        );

        return [
            'uuid' => (string) Str::uuid(),
            'tenant_id' => $tenantId,
            'entity_type' => $entityType,
            'label' => $label,
            'properties' => $properties,
            'vector_embedding' => [0.123, -0.456, 0.789, 0.012],
            'checksum_sha256' => $checksum,
        ];
    }

    public function configure(): static
    {
        return $this->afterMaking(function (MemoryNode $node) {
            $action = new UpsertMemoryNodeAction();
            $node->checksum_sha256 = $action->calculateChecksum(
                tenantId: (int) $node->tenant_id,
                entityType: $node->entity_type,
                label: $node->label,
                properties: (array) $node->properties
            );
        });
    }
}
