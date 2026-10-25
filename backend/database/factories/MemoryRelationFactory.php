<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Enums\RelationType;
use App\Models\MemoryNode;
use App\Models\MemoryRelation;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<MemoryRelation>
 */
class MemoryRelationFactory extends Factory
{
    protected $model = MemoryRelation::class;

    public function definition(): array
    {
        $tenant = Tenant::factory()->create();
        $sourceNode = MemoryNode::factory()->create(['tenant_id' => $tenant->id]);
        $targetNode = MemoryNode::factory()->create(['tenant_id' => $tenant->id]);

        return [
            'tenant_id' => $tenant->id,
            'source_node_id' => $sourceNode->id,
            'target_node_id' => $targetNode->id,
            'relation_type' => fake()->randomElement(RelationType::values()),
            'weight' => fake()->randomFloat(2, 0.1, 1.0),
            'created_at' => now(),
        ];
    }
}
