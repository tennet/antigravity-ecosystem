<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * Standard semantic relation types between memory nodes.
 */
enum RelationType: string
{
    case RELATES_TO = 'relates_to';
    case DERIVED_FROM = 'derived_from';
    case PART_OF = 'part_of';
    case CONTRADICTS = 'contradicts';
    case SUPPORTS = 'supports';
    case CITES = 'cites';
    case BELONGS_TO = 'belongs_to';

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
