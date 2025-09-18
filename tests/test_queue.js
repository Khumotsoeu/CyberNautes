// test_queue.js
import assert from 'assert';
import { pushEvent, drain, getCfg, setCfg } from '../queue.js';


async function testQueue() {
console.log('Running queue tests...');
await setCfg({});


// Push some events
await pushEvent({ kind: 'unit', msg: 'hello' });
await pushEvent({ kind: 'unit', msg: 'world' });


const batch = await drain(10);
assert.equal(batch.length, 2, 'Should drain two events');
assert.equal(batch[0].kind, 'unit');


console.log('Queue tests passed.');
}


// Run
if (import.meta.url === `file://${process.argv[1]}`) {
testQueue().catch(err => { console.error(err); process.exit(1); });
}