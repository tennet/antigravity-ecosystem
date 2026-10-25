<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\EntityType;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

/**
 * MemoryNode Model representing an entity or fact in the tenant knowledge graph.
 *
 * @property int $id
 * @property string $uuid
 * @property int $tenant_id
 * @property string $entity_type
 * @property string $label
 * @property array<string, mixed> $properties
 * @property list<float>|null $vector_embedding
 * @property string $checksum_sha256
 * @property \Illuminate\Support\Carbon $created_at
 * @property \Illuminate\Support\Carbon $updated_at
 * @property-read Tenant $tenant
 * @property-read Collection<int, MemoryRelation> $outgoingRelations
 * @property-read Collection<int, MemoryRelation> $incomingRelations
 * @property-read Collection<int, MemoryNode> $outgoingNodes
 * @property-read Collection<int, MemoryNode> $incomingNodes
 */
class MemoryNode extends Model
{
    use HasFactory;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'uuid',
        'tenant_id',
        'entity_type',
        'label',
        'properties',
        'vector_embedding',
        'checksum_sha256',
    ];

    /**
     * PHP 8.4 Property Hook: Check if the node has an embedding vector.
     */
    public bool $hasEmbedding {
        get => !empty($this->vector_embedding);
    }

    /**
     * PHP 8.4 Property Hook: Dimensionality of the vector embedding.
     */
    public int $embeddingDimensions {
        get => is_array($this->vector_embedding) ? count($this->vector_embedding) : 0;
    }

    /**
     * Native Laravel 11 type casting declaration.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'tenant_id' => 'integer',
            'properties' => 'array',
            'vector_embedding' => 'array',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    /**
     * Model boot lifecycle events.
     */
    protected static function booted(): void
    {
        static::creating(function (MemoryNode $node): void {
            if (empty($node->uuid)) {
                $node->uuid = (string) Str::uuid();
            }
        });
    }

    /**
     * Tenant to which this memory node belongs.
     *
     * @return BelongsTo<Tenant, $this>
     */
    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class, 'tenant_id');
    }

    /**
     * Directed relations starting from this node.
     *
     * @return HasMany<MemoryRelation>
     */
    public function outgoingRelations(): HasMany
    {
        return $this->hasMany(MemoryRelation::class, 'source_node_id');
    }

    /**
     * Directed relations targeting this node.
     *
     * @return HasMany<MemoryRelation>
     */
    public function incomingRelations(): HasMany
    {
        return $this->hasMany(MemoryRelation::class, 'target_node_id');
    }

    /**
     * Outgoing neighboring nodes via relations.
     *
     * @return BelongsToMany<MemoryNode>
     */
    public function outgoingNodes(): BelongsToMany
    {
        return $this->belongsToMany(
            MemoryNode::class,
            'memory_relations',
            'source_node_id',
            'target_node_id'
        )->withPivot(['id', 'relation_type', 'weight', 'created_at']);
    }

    /**
     * Incoming neighboring nodes via relations.
     *
     * @return BelongsToMany<MemoryNode>
     */
    public function incomingNodes(): BelongsToMany
    {
        return $this->belongsToMany(
            MemoryNode::class,
            'memory_relations',
            'target_node_id',
            'source_node_id'
        )->withPivot(['id', 'relation_type', 'weight', 'created_at']);
    }

    /**
     * Local scope for rigorous multi-tenant data isolation.
     *
     * @param Builder<$this> $query
     * @param int $tenantId
     * @return Builder<$this>
     */
    public function scopeForTenant(Builder $query, int $tenantId): Builder
    {
        return $query->where($this->qualifyColumn('tenant_id'), $tenantId);
    }

    /**
     * Local scope filtering by entity type.
     *
     * @param Builder<$this> $query
     * @param EntityType|string $type
     * @return Builder<$this>
     */
    public function scopeOfType(Builder $query, EntityType|string $type): Builder
    {
        $value = $type instanceof EntityType ? $type->value : $type;
        return $query->where($this->qualifyColumn('entity_type'), $value);
    }

    /**
     * Anti-N+1 Query Scope: Eager loads the complete knowledge graph neighborhood.
     * Ensures exactly constant number of queries regardless of collection size,
     * while guaranteeing strict tenant boundary isolation across eager loaded edges.
     *
     * @param Builder<$this> $query
     * @param int|null $tenantId Optional tenant ID to enforce sub-query boundary
     * @return Builder<$this>
     */
    public function scopeWithKnowledgeGraph(Builder $query, ?int $tenantId = null): Builder
    {
        return $query->with([
            'outgoingRelations' => function (HasMany $relQuery) use ($tenantId): void {
                if ($tenantId !== null) {
                    $relQuery->where('tenant_id', $tenantId);
                }
                $relQuery->with([
                    'targetNode' => function (BelongsTo $targetQuery) use ($tenantId): void {
                        $targetQuery->select([
                            'id',
                            'uuid',
                            'tenant_id',
                            'entity_type',
                            'label',
                            'created_at',
                        ]);
                        if ($tenantId !== null) {
                            $targetQuery->where('tenant_id', $tenantId);
                        }
                    },
                ]);
            },
            'incomingRelations' => function (HasMany $relQuery) use ($tenantId): void {
                if ($tenantId !== null) {
                    $relQuery->where('tenant_id', $tenantId);
                }
                $relQuery->with([
                    'sourceNode' => function (BelongsTo $sourceQuery) use ($tenantId): void {
                        $sourceQuery->select([
                            'id',
                            'uuid',
                            'tenant_id',
                            'entity_type',
                            'label',
                            'created_at',
                        ]);
                        if ($tenantId !== null) {
                            $sourceQuery->where('tenant_id', $tenantId);
                        }
                    },
                ]);
            },
        ]);
    }

    /**
     * High-performance anti-N+1 retrieval method for tenant memory nodes.
     *
     * @param int $tenantId
     * @param int $limit
     * @return Collection<int, self>
     */
    public static function getGraphForTenant(int $tenantId, int $limit = 100): Collection
    {
        return static::query()
            ->forTenant($tenantId)
            ->withKnowledgeGraph($tenantId)
            ->latest('id')
            ->limit($limit)
            ->get();
    }
}
