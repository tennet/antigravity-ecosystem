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
        Schema::create('outbox_events', function (Blueprint $table): void {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->string('event_type', 64);
            $table->string('aggregate_type', 64);
            $table->unsignedBigInteger('aggregate_id');
            $table->json('payload');
            $table->string('status', 32)->default('PENDING');
            $table->unsignedInteger('retry_count')->default(0);
            $table->text('last_error')->nullable();
            $table->timestamp('processed_at')->nullable();
            $table->timestamps();

            // Composite indices tailored to transactional polling & aggregate lookup (ESR rule)
            $table->index(['status', 'created_at'], 'idx_outbox_events_status_created');
            $table->index(['tenant_id', 'status'], 'idx_outbox_events_tenant_status');
            $table->index(['aggregate_type', 'aggregate_id'], 'idx_outbox_events_aggregate');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('outbox_events');
    }
};
