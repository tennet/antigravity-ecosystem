<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

/**
 * Tenant Model.
 *
 * @property int $id
 * @property string $uuid
 * @property string $name
 * @property string|null $domain
 * @property bool $is_active
 * @property \Illuminate\Support\Carbon $created_at
 * @property \Illuminate\Support\Carbon $updated_at
 */
class Tenant extends Model
{
    use HasFactory;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'uuid',
        'name',
        'domain',
        'is_active',
    ];

    /**
     * Laravel 11 native casts declaration.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    /**
     * Automatically populate UUID if not provided.
     */
    protected static function booted(): void
    {
        static::creating(function (Tenant $tenant): void {
            if (empty($tenant->uuid)) {
                $tenant->uuid = (string) Str::uuid();
            }
        });
    }

    /**
     * Tenant knowledge nodes.
     *
     * @return HasMany<MemoryNode>
     */
    public function memoryNodes(): HasMany
    {
        return $this->hasMany(MemoryNode::class, 'tenant_id');
    }

    /**
     * Tenant graph relations.
     *
     * @return HasMany<MemoryRelation>
     */
    public function memoryRelations(): HasMany
    {
        return $this->hasMany(MemoryRelation::class, 'tenant_id');
    }
}
