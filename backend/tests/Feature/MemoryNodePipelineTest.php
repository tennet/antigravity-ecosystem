<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Actions\UpsertMemoryNodeAction;
use App\DTOs\MemoryNodeData;
use App\Enums\EntityType;
use App\Enums\RelationType;
use App\Http\Requests\StoreMemoryNodeRequest;
use App\Models\MemoryNode;
use App\Models\MemoryRelation;
use App\Models\Tenant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Tests\TestCase;

class MemoryNodePipelineTest extends TestCase
{
    use RefreshDatabase;

    private UpsertMemoryNodeAction $action;

    protected function setUp(): void
    {
        parent::setUp();
        $this->action = new UpsertMemoryNodeAction();
    }

    /**
     * Test: Multi-tenant scoping enforces strict isolation.
     */
    public function test_multi_tenant_scoping_enforces_data_isolation(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();

        $nodeA = MemoryNode::factory()->create(['tenant_id' => $tenantA->id]);
        $nodeB = MemoryNode::factory()->create(['tenant_id' => $tenantB->id]);

        $resultsA = MemoryNode::query()->forTenant($tenantA->id)->get();
        $resultsB = MemoryNode::query()->forTenant($tenantB->id)->get();

        $this->assertCount(1, $resultsA);
        $this->assertTrue($resultsA->first()->is($nodeA));

        $this->assertCount(1, $resultsB);
        $this->assertTrue($resultsB->first()->is($nodeB));
    }

    /**
     * Test: Anti-N+1 query execution executes a fixed constant query count.
     */
    public function test_with_knowledge_graph_prevents_n_plus_one_anti_pattern(): void
    {
        $tenant = Tenant::factory()->create();

        // Create a central node with 10 outgoing relations and 10 incoming relations
        $center = MemoryNode::factory()->create(['tenant_id' => $tenant->id]);

        for ($i = 0; $i < 5; $i++) {
            $other = MemoryNode::factory()->create(['tenant_id' => $tenant->id]);
            MemoryRelation::create([
                'tenant_id' => $tenant->id,
                'source_node_id' => $center->id,
                'target_node_id' => $other->id,
                'relation_type' => RelationType::RELATES_TO->value,
                'weight' => 0.8,
            ]);
            MemoryRelation::create([
                'tenant_id' => $tenant->id,
                'source_node_id' => $other->id,
                'target_node_id' => $center->id,
                'relation_type' => RelationType::CITES->value,
                'weight' => 0.5,
            ]);
        }

        DB::flushQueryLog();
        DB::enableQueryLog();

        // Execute eager-loaded graph query
        $nodes = MemoryNode::getGraphForTenant($tenant->id);

        $queries = DB::getQueryLog();

        // 1 query for nodes, 1 for outgoingRelations, 1 for outgoing targetNodes,
        // 1 for incomingRelations, 1 for incoming sourceNodes -> O(1) fixed queries!
        $this->assertLessThanOrEqual(5, count($queries), 'Query count must remain constant O(1)');
        $this->assertNotEmpty($nodes);
    }

    /**
     * Test: Checksum deduplication is canonical and deterministic.
     */
    public function test_deterministic_checksum_deduplication(): void
    {
        $tenant = Tenant::factory()->create();

        // Two payloads with different key orders
        $dto1 = new MemoryNodeData(
            tenantId: $tenant->id,
            entityType: 'concept',
            label: 'Vector Database Architecture',
            properties: ['category' => 'infra', 'scale' => 'distributed', 'priority' => 1],
            vectorEmbedding: [0.1, 0.2, 0.3]
        );

        $dto2 = new MemoryNodeData(
            tenantId: $tenant->id,
            entityType: 'concept',
            label: 'Vector Database Architecture',
            properties: ['priority' => 1, 'scale' => 'distributed', 'category' => 'infra'],
            vectorEmbedding: [0.1, 0.2, 0.3]
        );

        $res1 = $this->action->execute($dto1);
        $res2 = $this->action->execute($dto2);

        $this->assertEquals($res1->checksum, $res2->checksum);
        $this->assertFalse($res1->isDuplicate);
        $this->assertTrue($res2->isDuplicate);
        $this->assertEquals($res1->node->id, $res2->node->id);
        $this->assertEquals(1, MemoryNode::count());
    }

    /**
     * Test: Cascade on delete cleans up orphaned graph edges.
     */
    public function test_foreign_key_cascade_on_delete(): void
    {
        $tenant = Tenant::factory()->create();
        $source = MemoryNode::factory()->create(['tenant_id' => $tenant->id]);
        $target = MemoryNode::factory()->create(['tenant_id' => $tenant->id]);

        $relation = MemoryRelation::create([
            'tenant_id' => $tenant->id,
            'source_node_id' => $source->id,
            'target_node_id' => $target->id,
            'relation_type' => 'relates_to',
            'weight' => 1.0,
        ]);

        $this->assertDatabaseHas('memory_relations', ['id' => $relation->id]);

        // Deleting source node must cascade delete relation
        $source->delete();

        $this->assertDatabaseMissing('memory_relations', ['id' => $relation->id]);
        $this->assertDatabaseHas('memory_nodes', ['id' => $target->id]);
    }

    /**
     * Test: StoreMemoryNodeRequest validation rules.
     */
    public function test_store_request_validation(): void
    {
        $tenant = Tenant::factory()->create(['is_active' => true]);
        $inactiveTenant = Tenant::factory()->inactive()->create();

        // Valid payload
        $validData = [
            'tenant_id' => $tenant->id,
            'entity_type' => 'concept',
            'label' => 'Neural Synthesis',
            'properties' => ['domain' => 'ai'],
            'vector_embedding' => [0.123, -0.456, 0.789],
        ];

        $request = new StoreMemoryNodeRequest();
        $validator = Validator::make($validData, $request->rules());
        $this->assertTrue($validator->passes());

        // Inactive tenant should fail validation
        $invalidData = $validData;
        $invalidData['tenant_id'] = $inactiveTenant->id;
        $validatorInactive = Validator::make($invalidData, $request->rules());
        $this->assertTrue($validatorInactive->fails());
        $this->assertArrayHasKey('tenant_id', $validatorInactive->errors()->toArray());
    }

    /**
     * Test: Anti-BOLA security check strictly forbids cross-tenant relations.
     */
    public function test_cross_tenant_relation_is_strictly_rejected(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();

        $nodeA = MemoryNode::factory()->create(['tenant_id' => $tenantA->id]);
        $nodeB = MemoryNode::factory()->create(['tenant_id' => $tenantB->id]);

        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('BOLA Security Violation');

        MemoryRelation::create([
            'tenant_id' => $tenantA->id,
            'source_node_id' => $nodeA->id,
            'target_node_id' => $nodeB->id, // Cross-tenant! Belongs to tenant B!
            'relation_type' => 'relates_to',
            'weight' => 1.0,
        ]);
    }

    /**
     * Test: Self-referential relations (source_node_id === target_node_id) are rejected.
     */
    public function test_self_referential_relation_is_rejected(): void
    {
        $tenant = Tenant::factory()->create();
        $node = MemoryNode::factory()->create(['tenant_id' => $tenant->id]);

        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('Self-referential relation rejected');

        MemoryRelation::create([
            'tenant_id' => $tenant->id,
            'source_node_id' => $node->id,
            'target_node_id' => $node->id,
            'relation_type' => 'relates_to',
            'weight' => 1.0,
        ]);
    }

    /**
     * Test: Properties nesting depth exceeding limit is rejected by action.
     */
    public function test_deeply_nested_properties_trigger_depth_exception(): void
    {
        $tenant = Tenant::factory()->create();

        // Build 7 levels deep nested array
        $deepProps = ['level1' => ['level2' => ['level3' => ['level4' => ['level5' => ['level6' => 'boom']]]]]];

        $dto = new MemoryNodeData(
            tenantId: $tenant->id,
            entityType: 'concept',
            label: 'Nested Test',
            properties: $deepProps
        );

        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('Properties nesting level exceeds maximum permitted depth');

        $this->action->execute($dto);
    }
}
