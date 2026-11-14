<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Actions\UpsertMemoryNodeAction;
use App\DTOs\MemoryNodeData;
use App\Models\MemoryNode;
use App\Models\OutboxEvent;
use App\Models\Tenant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UpsertMemoryNodeOutboxTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;
    private UpsertMemoryNodeAction $action;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::create([
            'name' => 'Acme Corp',
            'domain' => 'acme.test',
            'is_active' => true,
        ]);

        $this->action = new UpsertMemoryNodeAction();
    }

    public function test_it_creates_outbox_event_atomically_when_new_node_is_created_without_embedding(): void
    {
        $data = new MemoryNodeData(
            tenantId: $this->tenant->id,
            entityType: 'concept',
            label: 'Vector Search Ingestion',
            properties: ['source' => 'arxiv', 'year' => 2026],
            vectorEmbedding: null,
        );

        $result = $this->action->execute($data);

        $this->assertFalse($result->isDuplicate);
        $this->assertNotNull($result->outboxEvent);
        $this->assertInstanceOf(OutboxEvent::class, $result->outboxEvent);

        $this->assertDatabaseHas('outbox_events', [
            'id' => $result->outboxEvent->id,
            'tenant_id' => $this->tenant->id,
            'event_type' => 'memory_node.embedding_requested',
            'aggregate_type' => 'memory_node',
            'aggregate_id' => $result->node->id,
            'status' => 'PENDING',
            'retry_count' => 0,
        ]);

        $this->assertEquals($result->node->id, $result->outboxEvent->payload['node_id']);
        $this->assertEquals($result->node->checksum_sha256, $result->outboxEvent->payload['checksum_sha256']);
        $this->assertTrue($result->outboxEvent->isPending);
    }

    public function test_it_does_not_create_outbox_event_when_new_node_is_created_with_embedding(): void
    {
        $data = new MemoryNodeData(
            tenantId: $this->tenant->id,
            entityType: 'concept',
            label: 'Precomputed Embedding Node',
            properties: ['status' => 'indexed'],
            vectorEmbedding: [0.15, -0.42, 0.88],
        );

        $result = $this->action->execute($data);

        $this->assertFalse($result->isDuplicate);
        $this->assertNull($result->outboxEvent);
        $this->assertDatabaseCount('outbox_events', 0);
    }

    public function test_it_creates_outbox_event_when_existing_node_lacks_embedding(): void
    {
        // 1. Initial creation without embedding (creates initial outbox event)
        $data = new MemoryNodeData(
            tenantId: $this->tenant->id,
            entityType: 'fact',
            label: 'Graph Topology 101',
            properties: ['version' => 1],
            vectorEmbedding: null,
        );
        $firstResult = $this->action->execute($data);
        $this->assertNotNull($firstResult->outboxEvent);

        // 2. Subsequent upsert of the identical record without embedding
        $secondResult = $this->action->execute($data);

        $this->assertTrue($secondResult->isDuplicate);
        $this->assertFalse($secondResult->wasUpdated);
        $this->assertNotNull($secondResult->outboxEvent);
        $this->assertEquals('memory_node.embedding_requested', $secondResult->outboxEvent->event_type);
        $this->assertEquals($firstResult->node->id, $secondResult->node->id);
    }

    public function test_it_does_not_create_outbox_event_when_existing_node_already_has_embedding(): void
    {
        // 1. Node created with embedding
        $data = new MemoryNodeData(
            tenantId: $this->tenant->id,
            entityType: 'fact',
            label: 'Already Embedded Fact',
            properties: ['dim' => 3],
            vectorEmbedding: [0.1, 0.2, 0.3],
        );
        $firstResult = $this->action->execute($data);
        $this->assertNull($firstResult->outboxEvent);

        // 2. Subsequent upsert without embedding does NOT re-request embedding because node already has it
        $syncData = new MemoryNodeData(
            tenantId: $this->tenant->id,
            entityType: 'fact',
            label: 'Already Embedded Fact',
            properties: ['dim' => 3],
            vectorEmbedding: null,
        );
        $secondResult = $this->action->execute($syncData);

        $this->assertTrue($secondResult->isDuplicate);
        $this->assertNull($secondResult->outboxEvent);
        $this->assertDatabaseCount('outbox_events', 0);
    }
}
