# Install + Settings

## `install` Options

`definePlugin({ install })` and `createServer({ installer })` use the same install model.

`InstallOptions`:

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | Disable installer UI exposure. |
| `configurationRequired` | `boolean` | `false` | Install action stays disabled until required settings are valid. |
| `title` | `string` | plugin name | Installer title. |
| `subtitle` | `string` | SDK default | Installer subtitle. |
| `description` | `string` | plugin description | Installer description. |
| `logo` | `string` | `plugin.logo` | Installer logo URL. |
| `installButtonText` | `string` | `Install` | Primary CTA text. |
| `openManifestButtonText` | `string` | `Open Manifest` | Secondary CTA text. |
| `fields` | `SettingField[]` | `[]` | Settings schema. |

`/studio-config` includes `configurationRequired` and field metadata for the UI.

## Setting Field Types

All fields share: `key`, `label`, `description?`, `placeholder?`, `required?`, `queryParam?`.

Type-specific options:

- `text`: `defaultValue?: string`
- `password`: `defaultValue?: string`
- `textarea`: `defaultValue?: string`
- `number`: `defaultValue?: number`, `min?`, `max?`, `step?`
- `checkbox`: `defaultValue?: boolean`
- `select`: `options: Array<{ label, value }>`, `defaultValue?: string`
- `multi_select`: `options`, `defaultValue?: string[]`, `searchable?: boolean`, `maxSelected?: number`

Helper builders:

- `settings.text(...)`
- `settings.password(...)`
- `settings.textarea(...)`
- `settings.number(...)`
- `settings.checkbox(...)`
- `settings.select(...)`
- `settings.multiSelect(...)`

## Runtime Parsing Semantics

Settings are parsed from query params before handlers run.

- query key = `field.queryParam` or fallback `field.key`
- missing value uses `defaultValue` (if provided)
- `required: true` throws `REQUEST_INVALID` when missing/empty
- `number` enforces `min`, `max`, `step`
- `select`/`multi_select` enforce allowed options
- `multi_select` supports repeated keys and comma-separated values

Handler access:

```ts
handler: async (request, { settings }) => {
  // settings is typed from your install field definitions
}
```
