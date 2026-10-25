<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\MemoryRelation;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin MemoryRelation
 */
class MemoryRelationResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'tenant_id' => $this->tenant_id,
            'source_node_id' => $this->source_node_id,
            'target_node_id' => $this->target_node_id,
            'relation_type' => $this->relation_type,
            'weight' => $this->weight,
            'created_at' => $this->created_at?->toIso8601String(),
            'target_node' => new MemoryNodeResource($this->whenLoaded('targetNode')),
            'source_node' => new MemoryNodeResource($this->whenLoaded('sourceNode')),
        ];
    }
}
