<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * Lifecycle statuses for Transactional Outbox Events.
 */
enum OutboxStatus: string
{
    case PENDING = 'PENDING';
    case PROCESSING = 'PROCESSING';
    case COMPLETED = 'COMPLETED';
    case FAILED = 'FAILED';

    /**
     * Get all supported raw status values.
     *
     * @return list<string>
     */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
