<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * Supported Entity Types for Knowledge Graph Nodes.
 */
enum EntityType: string
{
    case CONCEPT = 'concept';
    case DOCUMENT = 'document';
    case ENTITY = 'entity';
    case AGENT = 'agent';
    case EPISODE = 'episode';
    case FACT = 'fact';

    /**
     * Get all supported raw values.
     *
     * @return list<string>
     */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
