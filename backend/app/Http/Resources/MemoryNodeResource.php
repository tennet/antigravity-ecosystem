<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\MemoryNode;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin MemoryNode
 */
class MemoryNodeResource extends JsonResource
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
            'uuid' => $this->uuid,
            'tenant_id' => $this->tenant_id,
            'entity_type' => $this->entity_type,
            'label' => $this->label,
            'properties' => $this->properties,
            'has_embedding' => $this->hasEmbedding,
            'embedding_dimensions' => $this->embeddingDimensions,
            'checksum_sha256' => $this->checksum_sha256,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
            'outgoing_relations' => MemoryRelationResource::collection(
                $this->whenLoaded('outgoingRelations')
            ),
            'incoming_relations' => MemoryRelationResource::collection(
                $this->whenLoaded('incomingRelations')
            ),
        ];
    }
}
