<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\DTOs\MemoryNodeData;
use App\Enums\EntityType;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * FormRequest: Strict validation and authorization for storing or upserting a MemoryNode.
 * Hardened against JSON bombs, recursion exhaustion, BOLA tenant boundary crossing,
 * and IEEE 754 NaN/INF numerical injection.
 */
class StoreMemoryNodeRequest extends FormRequest
{
    public const int MAX_PROPERTIES_DEPTH = 5;
    public const int MAX_PROPERTY_STRING_BYTES = 10240; // 10 KB per string value

    /**
     * Determine if the user is authorized to make this request.
     * Enforces strict multi-tenant boundary checks.
     */
    public function authorize(): bool
    {
        $user = $this->user();

        // If no user context is loaded, rely on authorization gate or reject
        if ($user === null) {
            return false;
        }

        $targetTenantId = (int) $this->input('tenant_id');

        // Check if user is Super Admin or belongs explicitly to the requested tenant
        if (method_exists($user, 'isSuperAdmin') && $user->isSuperAdmin()) {
            return true;
        }

        // Standard tenant isolation check
        $userTenantId = $user->tenant_id ?? null;
        if ($userTenantId !== null && (int) $userTenantId === $targetTenantId) {
            return true;
        }

        // Custom Gate or Policy check
        if (method_exists($user, 'can') && $user->can('write-memory-node', $targetTenantId)) {
            return true;
        }

        return false;
    }

    /**
     * Sanitize and normalize incoming inputs before validation.
     */
    protected function prepareForValidation(): void
    {
        $inputs = $this->all();

        if (isset($inputs['label']) && is_string($inputs['label'])) {
            $inputs['label'] = trim(strip_tags($inputs['label']));
        }

        if (isset($inputs['entity_type']) && is_string($inputs['entity_type'])) {
            $inputs['entity_type'] = strtolower(trim($inputs['entity_type']));
        }

        if (!isset($inputs['properties'])) {
            $inputs['properties'] = [];
        }

        $this->replace($inputs);
    }

    /**
     * Validation rules defending against malicious or malformed payloads.
     *
     * @return array<string, list<mixed>>
     */
    public function rules(): array
    {
        return [
            'tenant_id' => [
                'required',
                'integer',
                'min:1',
                Rule::exists('tenants', 'id')->where(function ($query) {
                    $query->where('is_active', true);
                }),
            ],
            'uuid' => [
                'sometimes',
                'nullable',
                'uuid',
                Rule::unique('memory_nodes', 'uuid'),
            ],
            'entity_type' => [
                'required',
                'string',
                'max:64',
                'regex:/^[a-z0-9_\-]+$/',
            ],
            'label' => [
                'required',
                'string',
                'min:1',
                'max:255',
            ],
            'properties' => [
                'present',
                'array',
                'max:500', // Guard against JSON explosion DoS attacks
            ],
            'vector_embedding' => [
                'nullable',
                'array',
                'min:1',
                'max:4096', // Support vectors up to 4096-dimensions
            ],
            'vector_embedding.*' => [
                'numeric',
            ],
        ];
    }

    /**
     * Configure the validator instance with deep semantic safety checks.
     */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            $properties = $this->input('properties');
            if (is_array($properties)) {
                $depthError = $this->validateArrayDepthAndSize($properties, 1);
                if ($depthError !== null) {
                    $validator->errors()->add('properties', $depthError);
                }
            }

            $embedding = $this->input('vector_embedding');
            if (is_array($embedding)) {
                foreach ($embedding as $index => $val) {
                    if (is_float($val) || is_int($val) || is_numeric($val)) {
                        $floatVal = (float) $val;
                        if (is_nan($floatVal) || is_infinite($floatVal)) {
                            $validator->errors()->add("vector_embedding.{$index}", 'Vector embedding values must be finite numbers (NaN and INF are strictly forbidden).');
                        }
                    }
                }
            }
        });
    }

    /**
     * Recursively validate array depth and string payload byte sizes.
     */
    private function validateArrayDepthAndSize(array $array, int $currentDepth): ?string
    {
        if ($currentDepth > self::MAX_PROPERTIES_DEPTH) {
            return 'Properties JSON payload exceeds maximum allowed nesting depth of ' . self::MAX_PROPERTIES_DEPTH . ' levels.';
        }

        foreach ($array as $key => $val) {
            if (is_string($val) && strlen($val) > self::MAX_PROPERTY_STRING_BYTES) {
                return "Property key '{$key}' contains a string exceeding the maximum allowed size of " . (self::MAX_PROPERTY_STRING_BYTES / 1024) . " KB.";
            }

            if (is_array($val)) {
                $nestedCheck = $this->validateArrayDepthAndSize($val, $currentDepth + 1);
                if ($nestedCheck !== null) {
                    return $nestedCheck;
                }
            }
        }

        return null;
    }

    /**
     * Custom human-friendly validation error messages.
     *
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'tenant_id.exists' => 'The selected tenant does not exist or is inactive.',
            'entity_type.regex' => 'The entity_type may only contain lowercase alphanumeric characters, dashes, and underscores.',
            'vector_embedding.*.numeric' => 'Every dimension in the vector embedding must be a valid numeric floating-point value.',
            'properties.max' => 'The properties payload exceeds the maximum permitted key count.',
        ];
    }

    /**
     * Convert the validated request payload into an immutable DTO.
     */
    public function toDto(): MemoryNodeData
    {
        return MemoryNodeData::fromArray($this->validated());
    }
}
