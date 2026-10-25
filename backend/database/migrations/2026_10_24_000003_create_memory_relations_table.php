<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('memory_relations', function (Blueprint $table) {
            $table->id();

            // Multi-tenant Foreign Key with explicit cascade on delete
            $table->foreignId('tenant_id')
                ->constrained('tenants')
                ->cascadeOnDelete()
                ->cascadeOnUpdate();

            // Source & Target Node Foreign Keys with explicit cascade on delete
            $table->foreignId('source_node_id')
                ->constrained('memory_nodes')
                ->cascadeOnDelete()
                ->cascadeOnUpdate();

            $table->foreignId('target_node_id')
                ->constrained('memory_nodes')
                ->cascadeOnDelete()
                ->cascadeOnUpdate();

            $table->string('relation_type', 64);
            $table->float('weight', 8, 4)->default(1.0);

            $table->timestamp('created_at')->useCurrent();

            // Anti-cycle check constraint: prevent self-referential relations
            $table->check('source_node_id != target_node_id', 'chk_no_self_relation');

            // Prevent duplicate directed relations between the same nodes within a tenant
            $table->unique(
                ['tenant_id', 'source_node_id', 'target_node_id', 'relation_type'],
                'uniq_memory_relations_edge'
            );

            // Indexes for directional graph traversal and fast multi-tenant queries
            $table->index(
                ['tenant_id', 'source_node_id', 'relation_type'],
                'idx_relations_tenant_source_type'
            );
            $table->index(
                ['tenant_id', 'target_node_id', 'relation_type'],
                'idx_relations_tenant_target_type'
            );
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::disableForeignKeyConstraints();
        Schema::dropIfExists('memory_relations');
        Schema::enableForeignKeyConstraints();
    }
};
