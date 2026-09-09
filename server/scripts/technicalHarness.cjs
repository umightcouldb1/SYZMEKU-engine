#!/usr/bin/env node
// Never mutate accounts/roles through a remote technical harness.
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const result=spawnSync(process.execPath,['--test',...['coreScope','coreContext','coreMigration','commerceRegression'].map(n=>path.resolve(__dirname,'../tests/'+n+'.test.cjs'))],{stdio:'inherit',env:process.env});
process.exitCode=result.status ?? 1;
