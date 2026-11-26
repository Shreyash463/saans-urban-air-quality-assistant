import apiContract from '../../../contract/api.schema.json';

type JsonRecord = Record<string, unknown>;
type SchemaMap = Record<string, JsonRecord>;

const CONTRACT_MODELS = apiContract.models as unknown as SchemaMap;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveSchemaRef(node: JsonRecord, models: SchemaMap): JsonRecord {
  const ref = node.$ref;
  if (typeof ref !== 'string') return node;
  return models[ref.split('/').pop() ?? ''] ?? node;
}

function matchString(value: unknown, node: JsonRecord): boolean {
  if (typeof value !== 'string') return false;
  const minLen = typeof node.minLength === 'number' ? node.minLength : 0;
  return value.length >= minLen;
}

function matchNumber(value: unknown, node: JsonRecord, isInt: boolean): boolean {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  if (isInt && !Number.isInteger(value)) return false;
  const min = typeof node.minimum === 'number' ? node.minimum : -Infinity;
  const max = typeof node.maximum === 'number' ? node.maximum : Infinity;
  return value >= min && value <= max;
}

function matchScalarType(value: unknown, node: JsonRecord): boolean {
  const kind = node.type;
  if (kind === 'null') return value === null;
  if (kind === 'boolean') return typeof value === 'boolean';
  if (kind === 'string') return matchString(value, node);
  if (kind === 'integer' || kind === 'number') {
    return matchNumber(value, node, kind === 'integer');
  }
  return false;
}

function matchArray(value: unknown, node: JsonRecord, models: SchemaMap): boolean {
  if (!Array.isArray(value)) return false;
  const minItems = typeof node.minItems === 'number' ? node.minItems : 0;
  if (value.length < minItems) return false;
  const itemSchema = isRecord(node.items) ? node.items : {};
  return value.every((item) => matchesSchemaNode(item, itemSchema, models));
}

function matchObject(value: unknown, node: JsonRecord, models: SchemaMap): boolean {
  if (!isRecord(value)) return false;
  const props = isRecord(node.properties) ? node.properties : {};
  const required = new Set(
    Array.isArray(node.required) ? (node.required as string[]) : []
  );
  for (const [key, rawProp] of Object.entries(props)) {
    const fieldVal = value[key];
    if (fieldVal === undefined || fieldVal === null) {
      if (required.has(key)) return false;
      continue;
    }
    if (isRecord(rawProp) && !matchesSchemaNode(fieldVal, rawProp, models))
      return false;
  }
  return true;
}

function matchesSchemaNode(
  value: unknown,
  rawNode: JsonRecord,
  models: SchemaMap = CONTRACT_MODELS
): boolean {
  const node = resolveSchemaRef(rawNode, models);
  if ('const' in node) return value === node.const;
  if (Array.isArray(node.enum)) return node.enum.includes(value);
  if (Array.isArray(node.anyOf)) {
    return node.anyOf.some(
      (opt) => isRecord(opt) && matchesSchemaNode(value, opt, models)
    );
  }
  if (node.type === 'array') return matchArray(value, node, models);
  if (node.type === 'object' || isRecord(node.properties)) {
    return matchObject(value, node, models);
  }
  return matchScalarType(value, node);
}

export function validateContractModel(modelName: string, value: unknown): boolean {
  const model = CONTRACT_MODELS[modelName];
  return model ? matchesSchemaNode(value, model, CONTRACT_MODELS) : false;
}
