const test = require("node:test");
const { runIsolated } = require("./helpers/isolated-library.cjs");

test("压缩运行时验完整长度和摘要，损坏输入不替换可用后台运行时", () =>
  runIsolated(`
  const Runtime=require('./integration/node-runtime.cjs'),crypto=require('node:crypto'),zlib=require('node:zlib');
  const dir=path.join(S.HOME,'package','runtime');fs.mkdirSync(dir,{recursive:true});
  const bytes=Buffer.from('MZ_SYNTHETIC_BINARY'),input=path.join(dir,'node.exe.br'),target=path.join(S.HOME,'runtime','node.exe');
  fs.writeFileSync(input,zlib.brotliCompressSync(bytes));
  fs.writeFileSync(path.join(dir,'node-runtime.json'),JSON.stringify({size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')}));
  assert.equal(Runtime.source(path.dirname(dir)),input);assert.equal(Runtime.materialize(input,target),target);
  assert(fs.readFileSync(target).equals(bytes));const before=fs.readFileSync(target);
  fs.writeFileSync(input,zlib.brotliCompressSync(Buffer.from('MZ_CORRUPT_BINARY')));
  assert.throws(()=>Runtime.materialize(input,target));assert(fs.readFileSync(target).equals(before));
`));
