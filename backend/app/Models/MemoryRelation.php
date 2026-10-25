<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * MemoryRelation Model representing a directed edge in the knowledge graph.
 *
 * @property int $id
 * @property int $tenant_id
 * @property int $source_node_id
 * @property int $target_node_id
 * @property string $relation_type
 * @property float $weight
 * @property \Illuminate\Support\Carbon $created_at
 * @property-read Tenant $tenant
 * @property-read MemoryNode $sourceNode
 * @property-read MemoryNode $targetNode
 */
class MemoryRelation extends Model
{
    use HasFactory;

    public const string UPDATED_AT = null;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'tenant_id',
        'source_node_id',
        'target_node_id',
        'relation_type',
        'weight',
    ];

    /**
     * Laravel 11 native casts.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'tenant_id' => 'integer',
            'source_node_id' => 'integer',
            'target_node_id' => 'integer',
            'weight' => 'float',
            'created_at' => 'datetime',
        ];
    }

    /**
     * Model boot lifecycle events: Strict BOLA and Graph Integrity Guards.
     */
    protected static function booted(): void
    {
        static::saving(function (MemoryRelation $relation): void {
            if ($relation->source_node_id === $relation->target_node_id) {
                throw new \InvalidArgumentException(
                    "Self-referential relation rejected: source_node_id ({$relation->source_node_id}) cannot equal target_node_id."
                );
            }

            // Enforce Strict Cross-Tenant Boundary (Anti-BOLA)
            $nodes = MemoryNode::query()
                ->whereIn('id', [$relation->source_node_id, $relation->target_node_id])
                ->pluck('tenant_id', 'id');

            $sourceTenant = $nodes[$relation->source_node_id] ?? null;
            $targetTenant = $nodes[$relation->target_node_id] ?? null;

            if ($sourceTenant === null || $targetTenant === null) {
                throw new \InvalidArgumentException('Source or target node does not exist.');
            }

            if ($sourceTenant !== $relation->tenant_id || $targetTenant !== $relation->tenant_id) {
                throw new \InvalidArgumentException(
                    "BOLA Security Violation: Cross-tenant relations are strictly forbidden. " .
                    "Relation tenant: {$relation->tenant_id}, Source tenant: {$sourceTenant}, Target tenant: {$targetTenant}."
                );
            }
        });
    }

    /**
     * Tenant relationship.
     *
     * @return BelongsTo<Tenant, $this>
     */
    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class, 'tenant_id');
    }

    /**
     * Source node of this directed edge.
     *
     * @return BelongsTo<MemoryNode, $this>
     */
    public function sourceNode(): BelongsTo
    {
        return $this->belongsTo(MemoryNode::class, 'source_node_id');
    }

    /**
     * Target node of this directed edge.
     *
     * @return BelongsTo<MemoryNode, $this>
     */
    public function targetNode(): BelongsTo
    {
        return $this->belongsTo(MemoryNode::class, 'target_node_id');
    }

    /**
     * Local scope for tenant isolation.
     *
     * @param Builder<$this> $query
     * @return Builder<$this>
     */
    public function scopeForTenant(Builder $query, int $tenantId): Builder
    {
        return $query->where('tenant_id', $tenantId);
    }
}
