/**
 * Build the command payload from a rule result (unified for both immediate and
 * delayed execution). Pure: extracts `{ [attribute]: data.value }`, or returns
 * `data` verbatim when the result carries no attribute. Consumers then hand this
 * to a protocol adapter's `buildCommandMessages` to produce the MQTT topic+payload.
 */
export function buildCommandUnified(result: {
  attribute: string | null;
  data: any;
}): Record<string, any> {
  const command: Record<string, any> = {};

  if (result.attribute && result.data) {
    const dataValue = (result.data as { value: any })?.value;
    if (dataValue !== undefined) {
      command[result.attribute] = dataValue;
    }
  } else if (result.data) {
    return result.data as Record<string, any>;
  }

  return command;
}
