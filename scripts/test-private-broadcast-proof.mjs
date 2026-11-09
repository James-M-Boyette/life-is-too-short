/** Stage-1 disposable-only proof. No hosted credentials, URLs or app env files. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { prepare, sql, localCli, work, project, owned, root, command } from './test-local-supabase-services.mjs';

const report = { checks: [], blockers: [], audit: {}, environment: {} };
const clients = [];
const observations = [];
const check = (name, detail = {}) => { report.checks.push({ name, ...detail }); console.log(`PASS: ${name}`); };
function json(query) { return JSON.parse(sql(query)); }
function ok(result) {
  if (result.error) throw new Error(`API ${result.error.code}: ${result.error.message}`);
  return result.data;
}
async function until(predicate, timeout=12000) {
  const end=Date.now()+timeout;
  while(Date.now()<end) { if(predicate()) return true; await new Promise(r=>setTimeout(r,40)); }
  return false;
}
async function join(client, topic, isPrivate=true, forbidden=false, raw=null) {
  assert(await until(()=>!client.realtime.isDisconnecting(),2000));
  const item={client,topic,events:[],statuses:[],systems:[]}; observations.push(item);
  const channel=client.channel(topic,{config:{private:isPrivate,broadcast:{ack:true}}}); item.channel=channel;
  if(raw) channel.on('postgres_changes',raw,event=>item.events.push(event));
  else channel.on('broadcast',{event:'tasks_changed_v1'},event=>item.events.push(event));
  channel.on('system',{},event=>item.systems.push(event));
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error(`Join timeout is not proof of denial: ${topic}`)),15000);
    channel.subscribe((status,error)=>{
      item.statuses.push(status);
      if(status==='CHANNEL_ERROR') {
        clearTimeout(timer);
        if(forbidden && /permission|authoriz|authenticated/i.test(error?.message??'')) resolve();
        else reject(new Error(`Channel error: ${error?.message}`));
      }
      if(status==='SUBSCRIBED') { clearTimeout(timer); forbidden?reject(new Error('Unauthorized join succeeded')):resolve(); }
    });
  });
  if(forbidden) await client.removeChannel(channel);
  return item;
}
const messageCount=()=>Number(sql("SELECT count(*) FROM realtime.messages WHERE topic LIKE 'task-invalidation:%';"));
function asRole(role, owner, statement, topic='', commit=false) {
  assert(['authenticated','anon'].includes(role));
  return sql(`BEGIN; SET LOCAL ROLE ${role}; SET LOCAL request.jwt.claim.sub='${owner}'; SET LOCAL realtime.topic='${topic}'; ${statement}; ${commit?'COMMIT':'ROLLBACK'};`);
}
function expectPermissionFailure(action) {
  assert.throws(action,/permission denied|row-level security|must be owner|cannot set role/i);
}
function audit() {
  report.audit.roles = json("SELECT json_agg(json_build_object('role',rolname,'superuser',rolsuper,'bypassRls',rolbypassrls,'login',rolcanlogin)) FROM pg_roles WHERE rolname IN ('postgres','anon','authenticated','service_role','supabase_realtime_admin');");
  report.audit.policies = json("SELECT coalesce(json_agg(p),'[]') FROM (SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='realtime') p;");
  report.audit.relations = json("SELECT json_agg(r) FROM (SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='realtime' AND c.relkind IN ('r','p')) r;");
  report.audit.functions = json("SELECT json_agg(f) FROM (SELECT p.oid::regprocedure::text AS signature,pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.proacl::text,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='realtime' AND p.proname IN ('send','broadcast_changes','topic')) f;");
  report.audit.exposedSchemas = fs.readFileSync(path.join(root,'supabase/config.toml'),'utf8').match(/^schemas = .*$/m)[0];
  report.audit.publications = json("SELECT coalesce(json_agg(p),'[]') FROM (SELECT pubname,schemaname,tablename FROM pg_publication_tables) p;");
  report.audit.publicFunctions = json("SELECT json_agg(f) FROM (SELECT p.oid::regprocedure::text AS signature,p.prosecdef,has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') f;");
  report.audit.callableInventory = json("SELECT json_agg(f) FROM (SELECT p.oid::regprocedure::text AS signature,pg_get_userbyid(p.proowner) AS owner,p.prosecdef,has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('realtime','public') ORDER BY 1) f;");
  report.audit.defaultPrivileges = json("SELECT coalesce(json_agg(d),'[]') FROM (SELECT pg_get_userbyid(defaclrole) AS creator,coalesce(n.nspname,'*') AS schema,defaclobjtype,defaclacl::text FROM pg_default_acl a LEFT JOIN pg_namespace n ON n.oid=a.defaclnamespace) d;");
}
try {
  prepare();
  for (const name of fs.readdirSync(path.join(root,'supabase/migrations')).filter(n=>n.endsWith('.sql'))) {
    fs.copyFileSync(path.join(root,'supabase/migrations',name),path.join(work,'supabase/migrations',name));
  }
  localCli(['migration','up','--local']);
  report.environment = { project, work: path.relative(root,work), database:sql('SHOW server_version;') };
  report.environment.images=command('docker',['ps','--filter',`name=${project}`,'--format','{{.Names}} {{.Image}}']).stdout.trim().split('\n');
  report.environment.cli=localCli(['--version']).trim();
  audit();
  fs.writeFileSync(path.join(work,'audit.json'),JSON.stringify(report.audit,null,2));
  check('Actual migration chain installed unchanged; Realtime catalog audited');
  if (!process.argv.includes('--audit-only')) {
    const status=JSON.parse(localCli(['status','-o','json']));
    assert.equal(status.API_URL,'http://127.0.0.1:56321');
    const makeClient=()=>{ const c=createClient(status.API_URL,status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}); clients.push(c); return c; };
    const a=makeClient(), b=makeClient(), anon=makeClient();
    const password=`Local-only-${randomUUID()}!`;
    const emails=[`a-${randomUUID()}@proof.invalid`,`b-${randomUUID()}@proof.invalid`];
    const sa=ok(await a.auth.signUp({email:emails[0],password}));
    const sb=ok(await b.auth.signUp({email:emails[1],password}));
    assert(sa.session && sb.session);
    const aid=sa.user.id,bid=sb.user.id, ta=`task-invalidation:${aid}`,tb=`task-invalidation:${bid}`;
    // Baseline invoker cannot emit: PUBLIC EXECUTE does not bypass messages RLS.
    const invokerBefore=messageCount();
    asRole('authenticated',aid,`SELECT realtime.send('{"v":1}'::jsonb,'tasks_changed_v1','${tb}',true)`,'',true);
    assert.equal(messageCount(),invokerBefore);
    check('Invoker send denied by messages RLS, demonstrating need for server-only sender authority');
    sql(fs.readFileSync(path.join(root,'scripts/experiments/private-task-broadcast.sql'),'utf8'));
    report.audit.installedPolicies=json("SELECT json_agg(p) FROM (SELECT policyname,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='realtime' AND tablename='messages') p;");
    const ownerA=await join(a,ta);
    let ownerB=await join(b,tb);
    const publicA=await join(anon,ta,false);
    const publicObserver=await join(makeClient(),ta,false);
    const foreignA=await join(a,tb,true,true), foreignB=await join(b,ta,true,true);
    // SDK channel(topic) reuses a topic within a client, including its private
    // setting: use independent anonymous clients, not the public twin's client.
    await join(makeClient(),ta,true,true); await join(makeClient(),tb,true,true);
    await join(a,`task-invalidation:${randomUUID()}`,true,true);
    check('Own private joins allowed; foreign, guessed and anonymous joins rejected with explicit authorization errors');
    const raw=await join(a,`raw-proof-${randomUUID()}`,false,false,{event:'*',schema:'public',table:'tasks'});
    assert(await until(()=>raw.systems.some(m=>m.status==='error')));
    const rawMessages=await join(a,`raw-messages-${randomUUID()}`,false,false,{event:'*',schema:'realtime',table:'messages'});
    assert(await until(()=>rawMessages.systems.some(m=>m.status==='error')));
    const taskIds=new Set();
    const create=async(c,uid,title,projectId=null)=>{
      const id=randomUUID(); taskIds.add(id);
      return ok(await c.from('tasks').insert({id,user_id:uid,title,description:'CANARY SECRET MARKDOWN',project_id:projectId}).select('*').single());
    };
    let rowA,rowB;
    async function emitted(name, action, expectedA=1, expectedB=0) {
      const beforeA=ownerA.events.length,beforeB=ownerB.events.length,dbBefore=messageCount();
      await action();
      assert(await until(()=>ownerA.events.length>=beforeA+expectedA && ownerB.events.length>=beforeB+expectedB), `Notification missing: ${name}`);
      assert.equal(messageCount()-dbBefore,expectedA+expectedB);
      assert.equal(ownerA.events.length-beforeA,expectedA);
      assert.equal(ownerB.events.length-beforeB,expectedB);
      check(name,{notifications:expectedA+expectedB});
    }
    await emitted('Account A INSERT notifies only A',async()=>{rowA=await create(a,aid,'A PRIVATE TITLE');});
    await emitted('Account B INSERT notifies only B',async()=>{rowB=await create(b,bid,'B PRIVATE TITLE');},0,1);
    for(const [name,patch] of [
      ['Title and Markdown',{title:'Edited',description:'- SECRET BULLET'}],
      ['Completion',{is_done:true,status:'done'}],
      ['Scheduling and ordering',{planned_date:'2026-11-09',due_date:'2026-11-12',planned_position:1500}],
    ]) await emitted(`${name} UPDATE`,async()=>ok(await a.from('tasks').update(patch).eq('id',rowA.id)));
    const pr=ok(await a.from('projects').insert({user_id:aid,name:'Proof project'}).select('*').single());
    await emitted('Project assignment UPDATE',async()=>ok(await a.from('tasks').update({project_id:pr.id,project_position:2000}).eq('id',rowA.id)));
    await emitted('delete_project RPC task-to-Inbox UPDATE',async()=>ok(await a.rpc('delete_project',{p_project_id:pr.id})));
    assert.equal(ok(await a.from('tasks').select('project_id').eq('id',rowA.id).single()).project_id,null);
    await emitted('Task DELETE notifies A without task or deletion ID',async()=>ok(await a.from('tasks').delete().eq('id',rowA.id)));
    await emitted('Foreign DELETE notifies only B, never raw adversarial observer',async()=>ok(await b.from('tasks').delete().eq('id',rowB.id)),0,1);
    // Committed marker order fences negative cases on both topic streams.
    async function fence() {
      await emitted('Account A positive-control fence',async()=>{
        const t=await create(a,aid,'A control'); rowA=t;
      });
      await emitted('Account B positive-control fence',async()=>{
        const t=await create(b,bid,'B control'); rowB=t;
      },0,1);
    }
    const noMessages=messageCount(), rollbackA=ownerA.events.length,rollbackB=ownerB.events.length;
    sql(`BEGIN; INSERT INTO public.tasks(user_id,title) VALUES ('${aid}','rolled back canary'); ROLLBACK;`);
    assert.throws(()=>sql(`BEGIN; INSERT INTO public.tasks(user_id,title) VALUES ('${aid}','error rollback canary'); SELECT 1/0; COMMIT;`),/division by zero/);
    assert.equal(messageCount(),noMessages);
    const bad=await a.from('tasks').insert({user_id:bid,title:'forged owner'}); assert(bad.error);
    await fence();
    assert.equal(ownerA.events.length,rollbackA+1); assert.equal(ownerB.events.length,rollbackB+1);
    check('Rollback and rejected ownership produce no committed broadcast rows');
    const batchIds=[randomUUID(),randomUUID(),randomUUID()]; batchIds.forEach(id=>taskIds.add(id));
    await emitted('Three task changes in one transaction produce three per-row notifications',async()=>{
      sql(`BEGIN; INSERT INTO public.tasks(id,user_id,title) VALUES ${batchIds.map(id=>`('${id}','${aid}','bulk')`).join(',')}; COMMIT;`);
    },3,0);
    const bulkStart=Date.now();
    await emitted('25-task bulk statement emits 25 per-row notifications',async()=>{
      sql(`INSERT INTO public.tasks(user_id,title) SELECT '${aid}'::uuid,'bulk performance canary' FROM generate_series(1,25);`);
    },25,0);
    report.bulkObservation={rows:25,notifications:25,elapsedMilliseconds:Date.now()-bulkStart,
      note:'Local Docker observation, not a production throughput benchmark'};
    // Trusted transfer must invalidate both owners without changing frontend rules.
    await emitted('Trusted ownership transfer invalidates old and new accounts',async()=>{
      sql(`UPDATE public.tasks SET user_id='${bid}' WHERE id='${rowA.id}'`);
    },1,1);
    const forgedBefore=messageCount(), eventBefore=ownerA.events.length,eventBeforeB=ownerB.events.length;
    const restForge=await foreignB.channel.httpSend('tasks_changed_v1',{v:1});
    report.restForgeryResponse=restForge;
    report.ownRestForgeryResponse=await ownerB.channel.httpSend('tasks_changed_v1',{v:1});
    // HTTP acceptance is not delivery. Fence the stream before asserting below.
    const wsForge=await ownerB.channel.send({type:'broadcast',event:'tasks_changed_v1',payload:{v:1}},{timeout:2000});
    report.websocketForgeryResponse=wsForge;
    asRole('authenticated',bid,`SELECT realtime.send('{"v":1}'::jsonb,'tasks_changed_v1','${ta}',true)`,'',true);
    assert.equal(messageCount(),forgedBefore); assert.equal(ownerA.events.length,eventBefore);
    // Public spoof has a positive delivery control but cannot cross namespaces.
    assert.equal(await publicA.channel.send({type:'broadcast',event:'tasks_changed_v1',payload:{v:1}}),'ok');
    assert(await until(()=>publicObserver.events.length===1));
    await fence();
    assert.equal(ownerA.events.length,eventBefore+1);
    assert.equal(ownerB.events.length,eventBeforeB+1);
    check('REST, websocket and SQL send paths cannot forge private database notifications');
    assert.equal(Number(asRole('authenticated',aid,'SELECT count(*) FROM realtime.messages',tb)),0);
    assert(Number(asRole('authenticated',aid,'SELECT count(*) FROM realtime.messages',ta))>0);
    assert.equal(Number(asRole('anon','','SELECT count(*) FROM realtime.messages',ta)),0);
    expectPermissionFailure(()=>asRole('authenticated',aid,`INSERT INTO realtime.messages(topic,extension,private,event,payload) VALUES ('${tb}','broadcast',true,'tasks_changed_v1','{"v":1}')`));
    for(const rel of report.audit.relations.filter(r=>/^messages_\d/.test(r.relname))) {
      expectPermissionFailure(()=>asRole('authenticated',aid,`SELECT * FROM realtime.${rel.relname}`));
    }
    assert((await a.schema('realtime').from('messages').select('*')).error);
    assert((await a.schema('realtime').from('messages').insert({topic:tb,payload:{v:1}})).error);
    const graphql=await fetch(`${status.API_URL}/graphql/v1`,{method:'POST',headers:{apikey:status.ANON_KEY,
      Authorization:`Bearer ${ok(await a.auth.getSession()).session.access_token}`,'Content-Type':'application/json'},
      body:JSON.stringify({query:'{ __schema { queryType { fields { name } } mutationType { fields { name } } } }'})});
    const graphBody=await graphql.json();
    report.audit.graphqlStatus=graphql.status;
    if(graphBody.data?.__schema) {
      const schema=graphBody.data.__schema;
      report.audit.graphqlFields=[...(schema.queryType?.fields??[]),...(schema.mutationType?.fields??[])].map(f=>f.name);
      assert(!report.audit.graphqlFields.some(f=>/messages|subscription|notification/i.test(f)));
    } else if(graphBody.errors?.some(e=>e.message==='pg_graphql extension is not enabled.')) {
      report.audit.graphqlAvailability='disabled: pg_graphql extension is not enabled';
      report.limitations=['Enabled GraphQL behavior not tested; local gateway reports the extension disabled'];
    } else {
      report.audit.graphqlIntrospectionErrors=graphBody.errors;
      const graphRequest=async query=>{
        const response=await fetch(`${status.API_URL}/graphql/v1`,{method:'POST',headers:{apikey:status.ANON_KEY,
          Authorization:`Bearer ${ok(await a.auth.getSession()).session.access_token}`,'Content-Type':'application/json'},
          body:JSON.stringify({query})});
        return response.json();
      };
      // Introspection is disabled on some local installations. Verify a real
      // owned-table query before checking the actual default field names.
      const positive=await graphRequest('{ tasksCollection(first:1) { edges { node { id } } } }');
      report.audit.graphqlPositive=positive.errors??'owned task query succeeded';
      assert(positive.data?.tasksCollection && !positive.errors,'GraphQL task positive control failed');
      for(const field of ['messagesCollection','realtimeMessagesCollection','subscriptionCollection','realtimeSubscriptionCollection']) {
        const result=await graphRequest(`{ ${field}(first:1) { edges { node { id } } } }`);
        assert(result.errors?.some(e=>/unknown field|cannot query field/i.test(e.message)));
      }
      report.audit.graphqlNegativeFields=['messagesCollection','realtimeMessagesCollection','subscriptionCollection','realtimeSubscriptionCollection'];
    }
    assert.equal(sql("SELECT has_schema_privilege('authenticated','public','CREATE');"),'f');
    check('Cross-owner SQL/GUC, direct partitions and Data API message-row bypasses denied');
    // Fault injection proves that Broadcast is best effort and may lose a signal.
    const lostBefore=messageCount();
    sql('REVOKE INSERT ON realtime.messages FROM task_notification_sender_proof; REVOKE INSERT(id,payload,event,topic,private,extension) ON realtime.messages FROM task_notification_sender_proof;');
    ok(await b.from('tasks').update({title:'SAVED WITHOUT SIGNAL'}).eq('id',rowB.id));
    assert.equal(messageCount(),lostBefore);
    assert.equal(ok(await b.from('tasks').select('title').eq('id',rowB.id).single()).title,'SAVED WITHOUT SIGNAL');
    sql('GRANT INSERT(id,payload,event,topic,private,extension) ON realtime.messages TO task_notification_sender_proof;');
    await fence();
    check('Send-permission fault loses notification while task update commits; later Data API read is authoritative');
    // Offline receiver: stored broadcasts are not assumed to replay on join.
    await b.removeChannel(ownerB.channel);
    assert(await until(()=>!b.realtime.isDisconnecting(),2000));
    const offlineTask=await create(b,bid,'Offline change');
    const resumed=await join(b,tb);
    ownerB=resumed;
    assert.equal(resumed.events.length,0);
    assert.equal(ok(await b.from('tasks').select('id').eq('id',offlineTask.id).single()).id,offlineTask.id);
    ok(await b.from('tasks').update({is_done:true}).eq('id',offlineTask.id));
    assert(await until(()=>resumed.events.length===1));
    check('Disconnected client reads missed change via API; rejoin receives subsequent broadcast');
    const switching=makeClient();
    ok(await switching.auth.signInWithPassword({email:emails[0],password}));
    const switchA=await join(switching,ta);
    ok(await switching.auth.refreshSession());
    await switching.realtime.setAuth(ok(await switching.auth.getSession()).session.access_token);
    const n=switchA.events.length;
    await create(a,aid,'After token refresh'); assert(await until(()=>switchA.events.length>n));
    const savedToken=ok(await switching.auth.getSession()).session.access_token;
    ok(await switching.auth.signOut({scope:'local'}));
    ok(await switching.auth.signInWithPassword({email:emails[1],password}));
    await switching.realtime.setAuth(ok(await switching.auth.getSession()).session.access_token);
    assert(await until(()=>switchA.statuses.includes('CHANNEL_ERROR') || switchA.statuses.includes('CLOSED')));
    await switching.removeChannel(switchA.channel);
    const switchB=await join(switching,tb);
    const count=switchB.events.length;
    await create(b,bid,'B after switch'); assert(await until(()=>switchB.events.length>count));
    const replay=makeClient();
    // Access tokens remain valid after logout until expiry; document this limit.
    await replay.realtime.setAuth(savedToken); await join(replay,ta);
    check('Token refresh works; switched B cannot retain A topic; valid saved A JWT remains A-authorized until expiry');
    await fence();
    assert.equal(raw.events.length,0); assert.equal(rawMessages.events.length,0);
    assert.equal(foreignA.events.length,0); assert.equal(foreignB.events.length,0);
    // Public spoof was one client message; no database-generated messages there.
    assert(publicA.events.every(e=>!e.payload.id));
    assert(publicObserver.events.every(e=>!e.payload.id));
    for(const item of observations.filter(o=>o!==publicA && o!==publicObserver && o!==raw && o!==rawMessages)) {
      for(const event of item.events) {
        assert.equal(event.event,'tasks_changed_v1'); assert.equal(event.payload.v,1);
        assert.deepEqual(Object.keys(event.payload).sort(),['id','v']);
        assert.match(event.payload.id,/^[a-f0-9-]{36}$/); assert(!taskIds.has(event.payload.id));
      }
    }
    report.audit.senderFunction=json("SELECT json_build_object('owner',pg_get_userbyid(proowner),'definer',prosecdef,'config',proconfig) FROM pg_proc WHERE oid='task_notification_proof.notify_tasks()'::regprocedure;");
    for(const role of ['anon','authenticated','service_role','postgres']) {
      assert.equal(sql(`SELECT pg_has_role('${role}','task_notification_sender_proof','SET') OR pg_has_role('${role}','task_notification_sender_proof','USAGE');`),'f');
    }
    assert.equal(sql("SELECT has_table_privilege('task_notification_sender_proof','public.tasks','SELECT');"),'f');
    assert.equal(sql("SELECT has_table_privilege('task_notification_sender_proof','realtime.messages','SELECT');"),'f');
    assert.equal(sql("SELECT relreplident FROM pg_class WHERE oid='public.tasks'::regclass;"),'d');
    assert.equal(sql("SELECT count(*) FROM pg_publication_tables WHERE schemaname='public' AND tablename='tasks';"),'0');
    check('Minimal versioned payloads only; no task IDs/content; raw feeds, public twins and foreign joins receive no private task activity');
    report.observations=observations.map(o=>({topic:o.topic,statuses:o.statuses,eventCount:o.events.length,systems:o.systems}));
  }
} catch (error) {
  report.failure = error.message; report.blockers.push(error.message); process.exitCode = 1; console.error(error.message);
} finally {
  for (const client of clients) await client.removeAllChannels();
  report.observations=observations.map(o=>({topic:o.topic,statuses:o.statuses,eventCount:o.events.length,systems:o.systems}));
  report.result=report.failure?'blocked':process.argv.includes('--audit-only')?'audit-only':'passed';
  fs.mkdirSync(path.join(root,'documentation/verification'),{recursive:true});
  fs.writeFileSync(path.join(root,'documentation/verification/private-broadcast-proof-results.json'),JSON.stringify(report,null,2)+'\n');
  if (owned && !process.argv.includes('--keep-stack')) localCli(['stop','--no-backup']);
}
