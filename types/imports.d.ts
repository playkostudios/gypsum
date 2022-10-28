// workaround for global namespaces:
// https://github.com/microsoft/TypeScript/issues/14051#issuecomment-423881354
import * as WL from '@wonderlandengine/api';

export import WL = WL;
export as namespace imports;