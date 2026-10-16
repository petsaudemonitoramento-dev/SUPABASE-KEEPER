import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeProbes } from "../src/lib/site-metrics.mjs";

const good = (latencyMs) => ({status:"online", latencyMs,httpStatus:200});
const bad = () => ({status:"error",latencyMs:1000,httpStatus:503});
const protectedResponse=()=>({status:"protected",latencyMs:230,httpStatus:307});

test("three healthy responses: median, mean, min and max",()=>{
 const r=summarizeProbes([good(758),good(148),good(120)]);
 assert.equal(r.status,"online");
 assert.equal(r.successCount,3);
 assert.equal(r.medianMs,148);
 assert.equal(r.meanMs,342);
 assert.equal(r.minMs,120);
 assert.equal(r.maxMs,758);
 assert.equal(r.error,null);
});

test("one failed response: partial success is flagged and excluded from latency",()=>{
 const r=summarizeProbes([good(1610),bad(),good(125)]);
 assert.equal(r.status,"online");
 assert.equal(r.successCount,2);
 assert.equal(r.medianMs,868);
 assert.equal(r.meanMs,868);
 assert.match(r.error,/2 de 3/);
});

test("one healthy response is not an online round",()=>{
 const r=summarizeProbes([good(120),bad(),bad()]);
 assert.equal(r.status,"error");
 assert.equal(r.successCount,1);
 assert.equal(r.medianMs,120);
});

test("protected responses are not counted as online",()=>{
 const r=summarizeProbes([protectedResponse(),protectedResponse(),bad()]);
 assert.equal(r.status,"protected");
 assert.equal(r.successCount,0);
 assert.equal(r.medianMs,null);
});

test("no healthy samples does not produce misleading zero latency",()=>{
 const r=summarizeProbes([bad(),bad(),bad()]);
 assert.equal(r.status,"error");
 assert.equal(r.medianMs,null);
 assert.equal(r.meanMs,null);
 assert.equal(r.minMs,null);
 assert.equal(r.maxMs,null);
});
