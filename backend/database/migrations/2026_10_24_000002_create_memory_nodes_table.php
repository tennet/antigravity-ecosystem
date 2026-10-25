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
        Schema::create('memory_nodes', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();

            // Multi-tenant Foreign Key with explicit cascade on delete
            $table->foreignId('tenant_id')
                ->constrained('tenants')
                ->cascadeOnDelete()
                ->cascadeOnUpdate();

            $table->string('entity_type', 64);
            $table->string('label', 255);
            $table->json('properties');
            $table->json('vector_embedding')->nullable();
            $table->string('checksum_sha256', 64);

            $table->timestamps();

            // Required Indexes
            $table->index(
                ['tenant_id', 'entity_type', 'created_at'],
                'idx_memory_nodes_tenant_type_created'
            );
            $table->index('checksum_sha256', 'idx_memory_nodes_checksum');

            // Multi-tenant idempotency & deduplication constraint
            $table->unique(
                ['tenant_id', 'checksum_sha256'],
                'uniq_memory_nodes_tenant_checksum'
            );
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::disableForeignKeyConstraints();
        Schema::dropIfExists('memory_nodes');
        Schema::enableForeignKeyConstraints();
    }
};
