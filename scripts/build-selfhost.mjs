import {build as viteBuild} from 'vite';
import react from '@vitejs/plugin-react';
import {build as bundle} from 'esbuild';
import path from 'node:path';
const root=process.cwd();
await viteBuild({configFile:false,root:path.join(root,'selfhost/client'),publicDir:path.join(root,'public'),plugins:[react()],build:{outDir:path.join(root,'selfhost-build/public'),emptyOutDir:true}});
await bundle({entryPoints:[path.join(root,'lib/clinic-model.ts')],outfile:path.join(root,'selfhost-build/clinic-model.mjs'),bundle:true,platform:'node',format:'esm',target:'node24'});
console.log('Self-host build ready.');
