// ─── KGRA Graph Designer ────────────────────────────────────────
// Manual nodes/edges CRUD + Design Guide
// Loaded alongside app.js — shares global state (API, showToast, etc.)

const DESIGNER_API = '/api/kgra-proxy/manual';

// ── Reference Data (ontology families + kinds + relationship types) ──

const NODE_FAMILIES = {
  System: ['application','service_group','workspace','platform','subsystem'],
  Artifact: ['repository','package','directory','file','manifest','config_file','workflow_file','document','schema_file','migration_file'],
  Element: ['module','package','service','library_unit','class','interface_type','function','method','component','page','screen','route_host','handler','workflow','workflow_step','job','task','agent','orchestrator','model_adapter'],
  Interface: ['ui_route','http_endpoint','rpc_method','graphql_field','cli_command','webhook','event_contract','stream_contract','batch_entry'],
  Data: ['database','schema','table','view','column','collection','document_type','cache','object_store','bucket','topic','queue','event','message_schema','feature_store','vector_index','knowledge_graph'],
  Runtime: ['environment','process','container','pod','vm','host','cluster','region','function_runtime','scheduled_runtime'],
  External: ['library','sdk','external_api','provider','saas','identity_provider','payment_gateway','llm_provider'],
  Control: ['permission','role','policy','rule','gate','lifecycle_stage','test','check','monitor','alert','approval','slo','sli','budget','quota'],
  Evidence: ['audit_event','log','trace','metric','report','ci_artifact','issue','pull_request','run_result','incident','outage','post_mortem'],
  Change: ['release','deployment','migration','rollback','refactor','version_upgrade','config_change','schema_migration'],
  Configuration: ['feature_flag','environment_variable','property','secret_ref','dynamic_route_rule','scaling_policy','retry_policy','timeout_setting','rate_limit','circuit_breaker'],
  Constraint: ['rate_limit','timeout','quota','size_limit','latency_budget','availability_target','rpo','rto'],
  Risk: ['vulnerability','threat','compliance_requirement','risk_register_entry','security_finding','audit_finding'],
  Incident: ['outage','performance_degradation','data_corruption','security_breach','false_positive_alert'],
};

const LINK_TYPES = {
  structural: ['CONTAINS','PART_OF','DECLARES','DEFINES','EXPORTS'],
  dependency: ['IMPORTS','USES','DEPENDS_ON','EXTENDS','IMPLEMENTS','COMPOSES','MIGRATED_FROM','REPLACES','DEPRECATES','SUPERSEDED_BY'],
  interface_flow: ['EXPOSES','ROUTES_TO','HANDLES','INVOKES','CALLS','TRIGGERS','ROUTES_CONDITIONALLY'],
  data_flow: ['READS','WRITES','UPDATES','DELETES','EMITS','CONSUMES','TRANSFORMS','PERSISTS_TO'],
  runtime_flow: ['RUNS_IN','DEPLOYS_TO','HOSTED_ON','SCALES_WITH','CONNECTS_TO','DEPLOYED_AT','ROLLED_BACK_FROM'],
  control_flow: ['REQUIRES','PROTECTED_BY','VALIDATED_BY','CHECKED_BY','TESTED_BY','BLOCKED_BY','APPROVED_BY','OBSERVED_BY','GOVERNED_BY_SLO','LIMITED_BY'],
  traceability: ['DOCUMENTED_BY','OWNED_BY','GENERATES','EVIDENCED_BY','RELATES_TO_DECISION','INTRODUCED_IN','REMOVED_IN'],
  risk_incident: ['VULNERABLE_TO','MITIGATED_BY','EXPLOITED_IN','CAUSED_INCIDENT','AFFECTED_BY_INCIDENT','REMEDIATED_BY'],
  configuration: ['CONFIGURED_BY','OVERRIDES','OVERRIDDEN_BY','CONDITIONALLY_ENABLED_BY'],
};

const VAGUE_LINK_NAMES = new Set(['RELATED_TO','CONNECTED_TO','ASSOCIATED_WITH','LINKED_TO']);

let designerNodes = [];
let designerEdges = [];
let designerPropertyRows = 0;

// ── Slug generator ──────────────────────────────────────────────

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 200);
}

// ── Main Designer Page ──────────────────────────────────────────

async function showDesigner() {
  const body = document.getElementById('main-body');
  body.innerHTML = `
    <div style="max-width:800px;">
      <div style="padding:0 0 12px;">
        <button onclick="renderGraphRAGTab()" style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;background:none;border:none;color:var(--text-dim);cursor:pointer;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
      </div>
      <h2 style="font-size:18px; font-weight:600; color:var(--text); margin-bottom:16px;">Graph Designer</h2>

      <!-- Node Designer -->
      <div class="card" style="margin-bottom:12px;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:14px;">🔵</span>
            <span class="card-title" style="margin:0;">Nodes</span>
            <span class="badge badge-info" id="designer-node-count">0</span>
          </div>
          <button class="btn btn-primary" onclick="showAddNodeForm()" style="font-size:11px; padding:4px 10px;">+ New Node</button>
        </div>
        <div id="designer-node-list" style="font-size:12px;">Loading...</div>
      </div>

      <!-- Edge Designer -->
      <div class="card" style="margin-bottom:12px;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:14px;">🔗</span>
            <span class="card-title" style="margin:0;">Links</span>
            <span class="badge badge-info" id="designer-edge-count">0</span>
          </div>
          <button class="btn btn-primary" onclick="showAddEdgeForm()" style="font-size:11px; padding:4px 10px;">+ New Link</button>
        </div>
        <div id="designer-edge-list" style="font-size:12px;">Loading...</div>
      </div>

      <!-- Templates -->
      <div class="card" style="margin-bottom:12px;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:14px;">📋</span>
            <span class="card-title" style="margin:0;">Templates</span>
          </div>
          <div style="display:flex; gap:4px;">
            <button class="btn" onclick="saveManualAsTemplate()" style="font-size:10px; padding:3px 8px;">Save Manual As...</button>
          </div>
        </div>
        <div id="designer-template-list" style="font-size:12px;">Loading...</div>
      </div>

      <!-- Modes -->
      <div class="card" style="margin-bottom:12px;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:14px;">👁</span>
            <span class="card-title" style="margin:0;">Modes</span>
          </div>
          <button class="btn" onclick="showCreateMode()" style="font-size:10px; padding:3px 8px;">+ Custom Mode</button>
          <button class="btn" onclick="showCreateComposition()" style="font-size:10px; padding:3px 8px;">+ Compose</button>
        </div>
        <div id="designer-mode-list" style="font-size:12px;">Loading...</div>
      </div>

      <!-- Design Guide -->
      <div class="card" style="margin-bottom:12px;">
        <details>
          <summary style="cursor:pointer; font-size:13px; font-weight:600; color:var(--text);">Design Guide</summary>
          <div style="font-size:11px; color:var(--text-dim); line-height:1.7; margin-top:8px;">
            <strong style="color:var(--text);">NODE</strong> = entity with <em>Family + Kind + Identity + Properties</em><br>
            &bull; Use a node when the thing has its own meaning and may connect to other things<br>
            &bull; Use a property when it's just a detail (e.g., createdAt)<br>
            &bull; 14 families: System, Artifact, Element, Interface, Data, Runtime, External, Control, Evidence, Change, Configuration, Constraint, Risk, Incident<br><br>
            <strong style="color:var(--text);">LINK</strong> = directional verb with <em>rules + properties</em><br>
            &bull; Good: USES, OWNS, DEPENDS_ON, GOVERNED_BY, RUNS_ON<br>
            &bull; Bad: RELATED_TO, CONNECTED_TO (too vague)<br>
            &bull; Always Source &rarr; Target (directional)<br>
            &bull; Hard = parser-confirmed | Soft = inferred (needs confidence)<br><br>
            <strong style="color:var(--text);">QUALITY</strong>: no vague edges, no duplicates, provenance on everything, confidence on inferred links
          </div>
        </details>
      </div>
    </div>
  `;
  await loadDesignerData();
}

// ── Data Loading ────────────────────────────────────────────────

let designerTemplates = [];
let designerModes = [];

async function loadDesignerData() {
  try {
    designerNodes = await fetch(`${DESIGNER_API}/nodes?status=active`).then(r => r.json());
    designerEdges = await fetch(`${DESIGNER_API}/edges?status=active`).then(r => r.json());
    designerTemplates = await fetch(`${API}/templates`).then(r => r.json()).catch(() => []);
    designerModes = await fetch(`${API}/modes`).then(r => r.json()).catch(() => []);
  } catch { designerNodes = []; designerEdges = []; designerTemplates = []; designerModes = []; }
  renderNodeList();
  renderEdgeList();
  renderTemplateList();
  renderModeList();
}

// ── Node List ───────────────────────────────────────────────────

function renderNodeList() {
  const el = document.getElementById('designer-node-list');
  const countEl = document.getElementById('designer-node-count');
  if (countEl) countEl.textContent = designerNodes.length;
  if (!el) return;
  if (designerNodes.length === 0) {
    el.innerHTML = '<div style="color:var(--text-muted); padding:8px 0;">No manual nodes yet. Click "+ New Node" to create one.</div>';
    return;
  }
  el.innerHTML = designerNodes.map(n => `
    <div style="display:flex; align-items:center; justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--border);">
      <div>
        <span style="color:var(--text); font-weight:500;">${n.name}</span>
        <span class="badge badge-info" style="font-size:9px; margin-left:4px;">${n.family}/${n.kind}</span>
        <div style="color:var(--text-muted); font-size:10px;">${n.unique_id}</div>
      </div>
      <div style="display:flex; gap:4px;">
        <button onclick="showEditNodeForm(${n.id})" style="background:none;border:none;cursor:pointer;color:var(--text-dim);font-size:13px;" title="Edit">✎</button>
        <button onclick="archiveNode(${n.id})" style="background:none;border:none;cursor:pointer;color:var(--text-dim);font-size:13px;" title="Archive">📦</button>
        <button onclick="deleteNode(${n.id})" style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:13px;" title="Delete">🗑</button>
      </div>
    </div>
  `).join('');
}

// ── Edge List ───────────────────────────────────────────────────

function renderEdgeList() {
  const el = document.getElementById('designer-edge-list');
  const countEl = document.getElementById('designer-edge-count');
  if (countEl) countEl.textContent = designerEdges.length;
  if (!el) return;
  if (designerEdges.length === 0) {
    el.innerHTML = '<div style="color:var(--text-muted); padding:8px 0;">No manual links yet. Click "+ New Link" to create one.</div>';
    return;
  }
  el.innerHTML = designerEdges.map(e => `
    <div style="display:flex; align-items:center; justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--border);">
      <div>
        <span style="color:var(--text);">${e.source_is_auto === 'true' ? '(auto)' : 'manual'} #${e.source_node_id}</span>
        <span style="color:#6366f1; font-weight:600; margin:0 4px;">&rarr; ${e.name} &rarr;</span>
        <span style="color:var(--text);">${e.target_is_auto === 'true' ? '(auto)' : 'manual'} #${e.target_node_id}</span>
        <span class="badge" style="font-size:9px; margin-left:4px;">${e.link_strength || 'hard'}</span>
      </div>
      <div style="display:flex; gap:4px;">
        <button onclick="showEditEdgeForm(${e.id})" style="background:none;border:none;cursor:pointer;color:var(--text-dim);font-size:13px;" title="Edit">✎</button>
        <button onclick="deleteEdge(${e.id})" style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:13px;" title="Delete">🗑</button>
      </div>
    </div>
  `).join('');
}

// ── Add Node Form ───────────────────────────────────────────────

function showAddNodeForm() {
  designerPropertyRows = 0;
  const body = document.getElementById('main-body');
  const familyOptions = Object.keys(NODE_FAMILIES).map(f => `<option value="${f}">${f}</option>`).join('');
  const firstFamily = Object.keys(NODE_FAMILIES)[0];
  const kindOptions = NODE_FAMILIES[firstFamily].map(k => `<option value="${k}">${k}</option>`).join('');

  body.innerHTML = `
    <div style="max-width:600px;">
      <div style="padding:0 0 12px;">
        <button onclick="showDesigner()" style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;background:none;border:none;color:var(--text-dim);cursor:pointer;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
      </div>
      <h2 style="font-size:16px; font-weight:600; color:var(--text); margin-bottom:12px;">New Node</h2>
      <div style="display:flex; flex-direction:column; gap:10px;">
        <div>
          <label style="font-size:11px; color:var(--text-dim); display:block; margin-bottom:3px;">Name *</label>
          <input class="input" id="node-name" placeholder="e.g. PS Wizard Agent" oninput="document.getElementById('node-uid').value=slugify(this.value)" />
        </div>
        <div>
          <label style="font-size:11px; color:var(--text-dim); display:block; margin-bottom:3px;">Unique ID *</label>
          <input class="input" id="node-uid" placeholder="auto-generated from name" />
        </div>
        <div style="display:flex; gap:8px;">
          <div style="flex:1;">
            <label style="font-size:11px; color:var(--text-dim); display:block; margin-bottom:3px;">Family *</label>
            <select class="input" id="node-family" onchange="updateKindOptions(this.value)">
              ${familyOptions}
            </select>
          </div>
          <div style="flex:1;">
            <label style="font-size:11px; color:var(--text-dim); display:block; margin-bottom:3px;">Kind *</label>
            <select class="input" id="node-kind">
              ${kindOptions}
            </select>
          </div>
        </div>
        <div>
          <label style="font-size:11px; color:var(--text-dim); display:block; margin-bottom:3px;">Description</label>
          <textarea class="input" id="node-desc" rows="2" placeholder="Optional notes..."></textarea>
        </div>
        <div>
          <label class="designer-label">Properties</label>
          <div id="node-properties"></div>
          <button class="btn" onclick="addPropertyRow('node-properties')" style="font-size:10px; padding:2px 8px; margin-top:4px;">+ Add Property</button>
        </div>
        <div style="display:flex; gap:8px;">
          <div style="flex:1;"><label class="designer-label">Valid From</label><input class="input" id="node-valid-from" type="date" /></div>
          <div style="flex:1;"><label class="designer-label">Valid Until</label><input class="input" id="node-valid-until" type="date" /></div>
        </div>
        <div id="node-form-warning" style="display:none; font-size:11px; color:#f59e0b; padding:4px 0;"></div>
        <div style="display:flex; gap:8px; margin-top:8px;">
          <button class="btn btn-primary" onclick="submitNewNode()" style="font-size:12px; padding:6px 16px;">Create Node</button>
          <button class="btn" onclick="showDesigner()" style="font-size:12px; padding:6px 16px;">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

function updateKindOptions(family) {
  const kinds = NODE_FAMILIES[family] || [];
  const select = document.getElementById('node-kind');
  if (select) select.innerHTML = kinds.map(k => `<option value="${k}">${k}</option>`).join('');
}

function addPropertyRow(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const rowId = `prop-row-${designerPropertyRows++}`;
  const div = document.createElement('div');
  div.id = rowId;
  div.style.cssText = 'display:flex; gap:4px; margin-bottom:4px;';
  div.innerHTML = `
    <input class="input prop-key" placeholder="key" style="flex:1; font-size:11px; padding:4px 6px;" />
    <input class="input prop-val" placeholder="value" style="flex:1; font-size:11px; padding:4px 6px;" />
    <button onclick="document.getElementById('${rowId}').remove()" style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:12px;">✕</button>
  `;
  container.appendChild(div);
}

function collectProperties(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return {};
  const props = {};
  const rows = container.querySelectorAll('div');
  for (const row of rows) {
    const key = row.querySelector('.prop-key')?.value?.trim();
    const val = row.querySelector('.prop-val')?.value?.trim();
    if (key) props[key] = val || '';
  }
  return props;
}

async function submitNewNode() {
  const name = document.getElementById('node-name')?.value?.trim();
  const unique_id = document.getElementById('node-uid')?.value?.trim();
  const family = document.getElementById('node-family')?.value;
  const kind = document.getElementById('node-kind')?.value;
  const description = document.getElementById('node-desc')?.value?.trim();
  const properties = collectProperties('node-properties');
  const warn = document.getElementById('node-form-warning');

  if (!name || !family || !kind) {
    if (warn) { warn.style.display = 'block'; warn.textContent = 'Name, Family, and Kind are required.'; }
    return;
  }

  try {
    const resp = await fetch(`${DESIGNER_API}/nodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, unique_id: unique_id || slugify(name), family, kind, description, properties, short_name: name }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      if (warn) { warn.style.display = 'block'; warn.textContent = data.error || 'Failed to create node.'; }
      return;
    }
    showToast(`Node "${name}" created`);
    showDesigner();
  } catch (err) {
    if (warn) { warn.style.display = 'block'; warn.textContent = err.message; }
  }
}

// ── Edit Node Form ──────────────────────────────────────────────

async function showEditNodeForm(id) {
  const node = designerNodes.find(n => n.id === id);
  if (!node) return;
  designerPropertyRows = 0;

  const familyOptions = Object.keys(NODE_FAMILIES).map(f => `<option value="${f}" ${f === node.family ? 'selected' : ''}>${f}</option>`).join('');
  const kinds = NODE_FAMILIES[node.family] || [];
  const kindOptions = kinds.map(k => `<option value="${k}" ${k === node.kind ? 'selected' : ''}>${k}</option>`).join('');

  const body = document.getElementById('main-body');
  body.innerHTML = `
    <div style="max-width:600px;">
      <div style="padding:0 0 12px;">
        <button onclick="showDesigner()" style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;background:none;border:none;color:var(--text-dim);cursor:pointer;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
      </div>
      <h2 style="font-size:16px; font-weight:600; color:var(--text); margin-bottom:12px;">Edit Node: ${node.name}</h2>
      <div style="display:flex; flex-direction:column; gap:10px;">
        <div>
          <label style="font-size:11px; color:var(--text-dim); display:block; margin-bottom:3px;">Name</label>
          <input class="input" id="edit-node-name" value="${node.name}" />
        </div>
        <div style="display:flex; gap:8px;">
          <div style="flex:1;">
            <label style="font-size:11px; color:var(--text-dim); display:block; margin-bottom:3px;">Family</label>
            <select class="input" id="edit-node-family" onchange="updateEditKindOptions(this.value)">
              ${familyOptions}
            </select>
          </div>
          <div style="flex:1;">
            <label style="font-size:11px; color:var(--text-dim); display:block; margin-bottom:3px;">Kind</label>
            <select class="input" id="edit-node-kind">
              ${kindOptions}
            </select>
          </div>
        </div>
        <div>
          <label style="font-size:11px; color:var(--text-dim); display:block; margin-bottom:3px;">Description</label>
          <textarea class="input" id="edit-node-desc" rows="2">${node.description || ''}</textarea>
        </div>
        <div>
          <label style="font-size:11px; color:var(--text-dim); display:block; margin-bottom:3px;">Properties</label>
          <div id="edit-node-properties"></div>
          <button class="btn" onclick="addPropertyRow('edit-node-properties')" style="font-size:10px; padding:2px 8px; margin-top:4px;">+ Add Property</button>
        </div>
        <div style="display:flex; gap:8px; margin-top:8px;">
          <button class="btn btn-primary" onclick="submitEditNode(${id})" style="font-size:12px; padding:6px 16px;">Save</button>
          <button class="btn" onclick="showDesigner()" style="font-size:12px; padding:6px 16px;">Cancel</button>
        </div>
      </div>
    </div>
  `;

  // Pre-fill existing properties
  const props = node.properties || {};
  for (const [key, val] of Object.entries(props)) {
    addPropertyRow('edit-node-properties');
    const rows = document.getElementById('edit-node-properties').querySelectorAll('div');
    const lastRow = rows[rows.length - 1];
    if (lastRow) {
      lastRow.querySelector('.prop-key').value = key;
      lastRow.querySelector('.prop-val').value = val;
    }
  }
}

function updateEditKindOptions(family) {
  const kinds = NODE_FAMILIES[family] || [];
  const select = document.getElementById('edit-node-kind');
  if (select) select.innerHTML = kinds.map(k => `<option value="${k}">${k}</option>`).join('');
}

async function submitEditNode(id) {
  const name = document.getElementById('edit-node-name')?.value?.trim();
  const family = document.getElementById('edit-node-family')?.value;
  const kind = document.getElementById('edit-node-kind')?.value;
  const description = document.getElementById('edit-node-desc')?.value?.trim();
  const properties = collectProperties('edit-node-properties');

  try {
    await fetch(`${DESIGNER_API}/nodes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, short_name: name, family, kind, description, properties }),
    });
    showToast(`Node updated`);
    showDesigner();
  } catch (err) { showToast(err.message, 'error'); }
}

// ── Node Actions ────────────────────────────────────────────────

async function archiveNode(id) {
  try {
    await fetch(`${DESIGNER_API}/nodes/${id}/archive`, { method: 'POST' });
    showToast('Node archived');
    await loadDesignerData();
  } catch (err) { showToast(err.message, 'error'); }
}

async function deleteNode(id) {
  if (!confirm('Delete this node and its edges? This cannot be undone.')) return;
  try {
    await fetch(`${DESIGNER_API}/nodes/${id}`, { method: 'DELETE' });
    showToast('Node deleted');
    await loadDesignerData();
  } catch (err) { showToast(err.message, 'error'); }
}

// ── Add Edge Form ───────────────────────────────────────────────

async function showAddEdgeForm() {
  designerPropertyRows = 0;

  // Build flat link type options grouped by category
  let linkOptions = '';
  for (const [category, types] of Object.entries(LINK_TYPES)) {
    linkOptions += `<optgroup label="${category}">`;
    linkOptions += types.map(t => `<option value="${t}">${t}</option>`).join('');
    linkOptions += '</optgroup>';
  }

  // Build node picker options (auto + manual)
  let nodeOptions = '<option value="">-- Select --</option>';
  // Manual nodes
  if (designerNodes.length > 0) {
    nodeOptions += '<optgroup label="Manual Nodes">';
    nodeOptions += designerNodes.map(n => `<option value="manual:${n.id}">${n.name} [${n.family}/${n.kind}]</option>`).join('');
    nodeOptions += '</optgroup>';
  }
  // Auto nodes (fetch top entities)
  try {
    const autoEntities = await fetch(`${API}/v1/analytics/entities?hub_count=50`).then(r => r.json());
    const autoOnly = autoEntities.filter(e => e.source !== 'manual' && e.source !== 'template');
    if (autoOnly.length > 0) {
      nodeOptions += '<optgroup label="Auto Nodes (top 50)">';
      nodeOptions += autoOnly.slice(0, 50).map(e => `<option value="auto:${e.id}">${e.name} [${e.type}]</option>`).join('');
      nodeOptions += '</optgroup>';
    }
  } catch {}

  const body = document.getElementById('main-body');
  body.innerHTML = `
    <div style="max-width:600px;">
      <div style="padding:0 0 12px;">
        <button onclick="showDesigner()" style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;background:none;border:none;color:var(--text-dim);cursor:pointer;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
      </div>
      <h2 style="font-size:16px; font-weight:600; color:var(--text); margin-bottom:12px;">New Link</h2>
      <div style="display:flex; flex-direction:column; gap:10px;">
        <div>
          <label style="font-size:11px; color:var(--text-dim); display:block; margin-bottom:3px;">Relationship Name *</label>
          <select class="input" id="edge-name" onchange="checkVagueLinkName(this.value)">
            ${linkOptions}
          </select>
          <div id="edge-name-warning" style="display:none; font-size:10px; color:#f59e0b; margin-top:2px;"></div>
        </div>
        <div>
          <label style="font-size:11px; color:var(--text-dim); display:block; margin-bottom:3px;">From (Source) * &rarr;</label>
          <select class="input" id="edge-source">${nodeOptions}</select>
        </div>
        <div>
          <label style="font-size:11px; color:var(--text-dim); display:block; margin-bottom:3px;">&rarr; To (Target) *</label>
          <select class="input" id="edge-target">${nodeOptions}</select>
        </div>
        <div style="display:flex; gap:8px;">
          <div style="flex:1;">
            <label style="font-size:11px; color:var(--text-dim); display:block; margin-bottom:3px;">Strength</label>
            <select class="input" id="edge-strength" onchange="toggleConfidence(this.value)">
              <option value="hard">Hard (confirmed)</option>
              <option value="soft">Soft (inferred)</option>
            </select>
          </div>
          <div style="flex:1;" id="edge-confidence-wrap" style="display:none;">
            <label style="font-size:11px; color:var(--text-dim); display:block; margin-bottom:3px;">Confidence (0-1)</label>
            <input class="input" id="edge-confidence" type="number" min="0" max="1" step="0.1" value="0.5" />
          </div>
        </div>
        <div>
          <label class="designer-label">Provenance</label>
          <input class="input" id="edge-provenance" placeholder="Source of this link (e.g., code review, architecture doc)" />
        </div>
        <div>
          <label class="designer-label">Description</label>
          <textarea class="input" id="edge-desc" rows="2" placeholder="Optional notes..."></textarea>
        </div>
        <div>
          <label class="designer-label">Properties</label>
          <div id="edge-properties"></div>
          <button class="btn" onclick="addPropertyRow('edge-properties')" style="font-size:10px; padding:2px 8px; margin-top:4px;">+ Add Property</button>
        </div>
        <div style="display:flex; gap:8px;">
          <div style="flex:1;"><label class="designer-label">Valid From</label><input class="input" id="edge-valid-from" type="date" /></div>
          <div style="flex:1;"><label class="designer-label">Valid Until</label><input class="input" id="edge-valid-until" type="date" /></div>
        </div>
        <div id="edge-form-warning" style="display:none; font-size:11px; color:#f59e0b; padding:4px 0;"></div>
        <div style="display:flex; gap:8px; margin-top:8px;">
          <button class="btn btn-primary" onclick="submitNewEdge()" style="font-size:12px; padding:6px 16px;">Create Link</button>
          <button class="btn" onclick="showDesigner()" style="font-size:12px; padding:6px 16px;">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

function checkVagueLinkName(name) {
  const warn = document.getElementById('edge-name-warning');
  if (warn) {
    if (VAGUE_LINK_NAMES.has(name)) {
      warn.style.display = 'block';
      warn.textContent = `"${name}" is vague — consider a more specific verb like USES, DEPENDS_ON, or GOVERNED_BY.`;
    } else {
      warn.style.display = 'none';
    }
  }
}

function toggleConfidence(strength) {
  const wrap = document.getElementById('edge-confidence-wrap');
  if (wrap) wrap.style.display = strength === 'soft' ? '' : 'none';
}

function parseNodeRef(val) {
  if (!val) return null;
  const [type, id] = val.split(':');
  return { id: parseInt(id) || id, isAuto: type === 'auto' };
}

async function submitNewEdge() {
  const name = document.getElementById('edge-name')?.value;
  const sourceRef = parseNodeRef(document.getElementById('edge-source')?.value);
  const targetRef = parseNodeRef(document.getElementById('edge-target')?.value);
  const strength = document.getElementById('edge-strength')?.value || 'hard';
  const confidence = document.getElementById('edge-confidence')?.value;
  const provenance = document.getElementById('edge-provenance')?.value?.trim();
  const description = document.getElementById('edge-desc')?.value?.trim();
  const properties = collectProperties('edge-properties');
  const warn = document.getElementById('edge-form-warning');

  if (!name || !sourceRef || !targetRef) {
    if (warn) { warn.style.display = 'block'; warn.textContent = 'Relationship name, source, and target are required.'; }
    return;
  }

  // Determine category from LINK_TYPES
  let category = '';
  for (const [cat, types] of Object.entries(LINK_TYPES)) {
    if (types.includes(name)) { category = cat; break; }
  }

  // For auto nodes, we need the integer entity ID
  let sourceId = sourceRef.id;
  let targetId = targetRef.id;
  if (sourceRef.isAuto && typeof sourceRef.id === 'string') {
    // Auto node ID is the entity name — we need to look up the DB id
    const entities = await fetch(`${API}/v1/analytics/entities?hub_count=50`).then(r => r.json());
    const found = entities.find(e => e.id === sourceRef.id);
    sourceId = found?._dbId || sourceRef.id;
  }
  if (targetRef.isAuto && typeof targetRef.id === 'string') {
    const entities = await fetch(`${API}/v1/analytics/entities?hub_count=50`).then(r => r.json());
    const found = entities.find(e => e.id === targetRef.id);
    targetId = found?._dbId || targetRef.id;
  }

  try {
    const resp = await fetch(`${DESIGNER_API}/edges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        source_node_id: sourceId,
        target_node_id: targetId,
        source_is_auto: sourceRef.isAuto,
        target_is_auto: targetRef.isAuto,
        relationship_type: name,
        relationship_category: category,
        link_strength: strength,
        confidence: strength === 'soft' ? confidence : null,
        provenance: provenance || null,
        description,
        properties,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      if (warn) { warn.style.display = 'block'; warn.textContent = data.error || 'Failed to create link.'; }
      return;
    }
    showToast(`Link "${name}" created`);
    showDesigner();
  } catch (err) {
    if (warn) { warn.style.display = 'block'; warn.textContent = err.message; }
  }
}

// ── Edit Edge Form ──────────────────────────────────────────────

async function showEditEdgeForm(id) {
  const edge = designerEdges.find(e => e.id === id);
  if (!edge) return;
  designerPropertyRows = 0;

  let linkOptions = '';
  for (const [category, types] of Object.entries(LINK_TYPES)) {
    linkOptions += `<optgroup label="${category}">`;
    linkOptions += types.map(t => `<option value="${t}" ${t === edge.name ? 'selected' : ''}>${t}</option>`).join('');
    linkOptions += '</optgroup>';
  }

  const body = document.getElementById('main-body');
  body.innerHTML = `
    <div style="max-width:600px;">
      <div style="padding:0 0 12px;">
        <button onclick="showDesigner()" style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;background:none;border:none;color:var(--text-dim);cursor:pointer;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
      </div>
      <h2 style="font-size:16px; font-weight:600; color:var(--text); margin-bottom:12px;">Edit Link</h2>
      <div style="display:flex; flex-direction:column; gap:10px;">
        <div>
          <label style="font-size:11px; color:var(--text-dim); display:block; margin-bottom:3px;">Relationship Name</label>
          <select class="input" id="edit-edge-name">${linkOptions}</select>
        </div>
        <div style="display:flex; gap:8px;">
          <div style="flex:1;">
            <label style="font-size:11px; color:var(--text-dim); display:block; margin-bottom:3px;">Strength</label>
            <select class="input" id="edit-edge-strength">
              <option value="hard" ${edge.link_strength === 'hard' ? 'selected' : ''}>Hard</option>
              <option value="soft" ${edge.link_strength === 'soft' ? 'selected' : ''}>Soft</option>
            </select>
          </div>
          <div style="flex:1;">
            <label style="font-size:11px; color:var(--text-dim); display:block; margin-bottom:3px;">Weight</label>
            <input class="input" id="edit-edge-weight" type="number" min="1" max="10" value="${edge.weight || 1}" />
          </div>
        </div>
        <div>
          <label style="font-size:11px; color:var(--text-dim); display:block; margin-bottom:3px;">Description</label>
          <textarea class="input" id="edit-edge-desc" rows="2">${edge.description || ''}</textarea>
        </div>
        <div>
          <label style="font-size:11px; color:var(--text-dim); display:block; margin-bottom:3px;">Properties</label>
          <div id="edit-edge-properties"></div>
          <button class="btn" onclick="addPropertyRow('edit-edge-properties')" style="font-size:10px; padding:2px 8px; margin-top:4px;">+ Add Property</button>
        </div>
        <div style="display:flex; gap:8px; margin-top:8px;">
          <button class="btn btn-primary" onclick="submitEditEdge(${id})" style="font-size:12px; padding:6px 16px;">Save</button>
          <button class="btn" onclick="showDesigner()" style="font-size:12px; padding:6px 16px;">Cancel</button>
        </div>
      </div>
    </div>
  `;

  // Pre-fill properties
  const props = edge.properties || {};
  for (const [key, val] of Object.entries(props)) {
    addPropertyRow('edit-edge-properties');
    const rows = document.getElementById('edit-edge-properties').querySelectorAll('div');
    const lastRow = rows[rows.length - 1];
    if (lastRow) {
      lastRow.querySelector('.prop-key').value = key;
      lastRow.querySelector('.prop-val').value = val;
    }
  }
}

async function submitEditEdge(id) {
  const name = document.getElementById('edit-edge-name')?.value;
  const link_strength = document.getElementById('edit-edge-strength')?.value;
  const weight = parseInt(document.getElementById('edit-edge-weight')?.value) || 1;
  const description = document.getElementById('edit-edge-desc')?.value?.trim();
  const properties = collectProperties('edit-edge-properties');

  let category = '';
  for (const [cat, types] of Object.entries(LINK_TYPES)) {
    if (types.includes(name)) { category = cat; break; }
  }

  try {
    await fetch(`${DESIGNER_API}/edges/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, relationship_type: name, relationship_category: category, link_strength, weight, description, properties }),
    });
    showToast('Link updated');
    showDesigner();
  } catch (err) { showToast(err.message, 'error'); }
}

// ── Edge Actions ────────────────────────────────────────────────

async function deleteEdge(id) {
  if (!confirm('Delete this link? This cannot be undone.')) return;
  try {
    await fetch(`${DESIGNER_API}/edges/${id}`, { method: 'DELETE' });
    showToast('Link deleted');
    await loadDesignerData();
  } catch (err) { showToast(err.message, 'error'); }
}

// ── Template List ───────────────────────────────────────────────

function renderTemplateList() {
  const el = document.getElementById('designer-template-list');
  if (!el) return;
  if (designerTemplates.length === 0) {
    el.innerHTML = '<div style="color:var(--text-muted); padding:8px 0;">No templates.</div>';
    return;
  }
  el.innerHTML = designerTemplates.map(t => {
    const isDefault = t.is_default === 'true';
    const isApplied = false; // TODO: check kgra_applied_templates
    return `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--border);">
        <div>
          ${isDefault ? '<span style="color:#f59e0b; margin-right:4px;">⭐</span>' : ''}
          <span style="color:var(--text); font-weight:500;">${t.name}</span>
          ${t.version ? `<span style="color:var(--text-muted); font-size:10px; margin-left:4px;">v${t.version}</span>` : ''}
        </div>
        <div style="display:flex; gap:4px;">
          <button onclick="showTemplateDetail(${t.id})" class="btn" style="font-size:10px; padding:2px 6px;">View</button>
          ${!isDefault ? `<button onclick="showEditTemplate(${t.id})" class="btn" style="font-size:10px; padding:2px 6px;">Edit</button>` : ''}
          <button onclick="applyTemplate(${t.id})" class="btn" style="font-size:10px; padding:2px 6px;">Apply</button>
          <button onclick="duplicateTemplate(${t.id})" class="btn" style="font-size:10px; padding:2px 6px;">Duplicate</button>
          ${!isDefault ? `<button onclick="deleteTemplate(${t.id})" style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:12px;">🗑</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

async function applyTemplate(id) {
  try {
    const resp = await fetch(`${API}/templates/${id}/apply`, { method: 'POST' });
    const data = await resp.json();
    showToast(`Template applied: ${data.nodes_copied} nodes, ${data.edges_copied} edges`);
    await loadDesignerData();
  } catch (err) { showToast(err.message, 'error'); }
}

async function unapplyTemplate(id) {
  try {
    await fetch(`${API}/templates/${id}/unapply`, { method: 'POST' });
    showToast('Template unapplied');
    await loadDesignerData();
  } catch (err) { showToast(err.message, 'error'); }
}

async function duplicateTemplate(id) {
  try {
    const resp = await fetch(`${API}/templates/${id}/duplicate`, { method: 'POST' });
    const data = await resp.json();
    showToast(`Template duplicated (id: ${data.new_template_id})`);
    await loadDesignerData();
  } catch (err) { showToast(err.message, 'error'); }
}

async function deleteTemplate(id) {
  if (!confirm('Delete this template? This cannot be undone.')) return;
  try {
    const resp = await fetch(`${API}/templates/${id}`, { method: 'DELETE' });
    const data = await resp.json();
    if (data.error) { showToast(data.error, 'error'); return; }
    showToast('Template deleted');
    await loadDesignerData();
  } catch (err) { showToast(err.message, 'error'); }
}

async function saveManualAsTemplate() {
  const name = prompt('Template name:');
  if (!name) return;
  try {
    const resp = await fetch(`${API}/templates/from-manual`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: `Saved from manual entries on ${new Date().toISOString().split('T')[0]}` }),
    });
    const data = await resp.json();
    if (data.error) { showToast(data.error, 'error'); return; }
    showToast(`Template "${name}" saved: ${data.nodes} nodes, ${data.edges} edges`);
    await loadDesignerData();
  } catch (err) { showToast(err.message, 'error'); }
}

// ── Mode List ───────────────────────────────────────────────────

function renderModeList() {
  const el = document.getElementById('designer-mode-list');
  if (!el) return;
  if (designerModes.length === 0) {
    el.innerHTML = '<div style="color:var(--text-muted); padding:8px 0;">No modes defined.</div>';
    return;
  }
  el.innerHTML = designerModes.map(m => {
    const isDefault = m.is_default === 'true';
    const families = (m.includes?.node_families || []).join(', ');
    return `
      <div style="padding:6px 0; border-bottom:1px solid var(--border);">
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <div>
            <span style="color:var(--text); font-weight:500;">${m.name}</span>
            ${isDefault ? '<span style="font-size:9px; color:var(--text-muted); margin-left:4px;">(default)</span>' : ''}
            <span style="color:var(--text-dim); font-size:10px; margin-left:6px;">${m.default_view_layout || ''}</span>
          </div>
          <div style="display:flex; gap:4px;">
            <button onclick="showModeEditor(${m.id})" style="background:none;border:none;cursor:pointer;color:var(--text-dim);font-size:12px;" title="Edit">✎</button>
            ${!isDefault ? `<button onclick="deleteMode(${m.id})" style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:12px;" title="Delete">🗑</button>` : ''}
          </div>
        </div>
        <div style="font-size:10px; color:var(--text-dim); margin-top:2px;">${m.primary_question || ''}</div>
        <div style="font-size:9px; color:var(--text-muted); margin-top:2px;">Families: ${families || 'all'}</div>
      </div>
    `;
  }).join('');
}

// ── Create Mode Form ────────────────────────────────────────────

function showCreateMode() {
  const familyCheckboxes = Object.keys(NODE_FAMILIES).map(f =>
    `<label style="display:flex; align-items:center; gap:4px; font-size:11px; color:var(--text-dim);">
      <input type="checkbox" class="mode-family-cb" value="${f}"> ${f}
    </label>`
  ).join('');

  const relCheckboxes = Object.entries(LINK_TYPES).map(([cat, types]) =>
    `<div style="margin-bottom:4px;">
      <div style="font-size:10px; font-weight:600; color:var(--text); margin-bottom:2px;">${cat}</div>
      ${types.map(t => `<label style="display:inline-flex; align-items:center; gap:3px; font-size:10px; color:var(--text-dim); margin-right:6px;">
        <input type="checkbox" class="mode-rel-cb" value="${t}"> ${t}
      </label>`).join('')}
    </div>`
  ).join('');

  const body = document.getElementById('main-body');
  body.innerHTML = `
    <div style="max-width:600px;">
      <div style="padding:0 0 12px;">
        <button onclick="showDesigner()" style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;background:none;border:none;color:var(--text-dim);cursor:pointer;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
      </div>
      <h2 style="font-size:16px; font-weight:600; color:var(--text); margin-bottom:12px;">New Custom Mode</h2>
      <div style="display:flex; flex-direction:column; gap:10px;">
        <div style="display:flex; gap:8px;">
          <div style="flex:1;">
            <label class="designer-label">Mode ID *</label>
            <input class="input" id="mode-id" placeholder="e.g. security_mode" />
          </div>
          <div style="flex:1;">
            <label class="designer-label">Name *</label>
            <input class="input" id="mode-name" placeholder="e.g. Security" />
          </div>
        </div>
        <div>
          <label class="designer-label">Persona</label>
          <input class="input" id="mode-persona" placeholder="e.g. Security engineer, auditor" />
        </div>
        <div>
          <label class="designer-label">Primary Question</label>
          <input class="input" id="mode-question" placeholder="What question does this mode answer?" />
        </div>
        <div>
          <label class="designer-label">Layout</label>
          <select class="input" id="mode-layout">
            <option value="force">Force</option>
            <option value="hierarchical">Hierarchical</option>
            <option value="circular">Circular</option>
          </select>
        </div>
        <div>
          <label class="designer-label">Include Node Families</label>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:2px; max-height:150px; overflow-y:auto; padding:4px; border:1px solid var(--border); border-radius:4px;">
            ${familyCheckboxes}
          </div>
        </div>
        <div>
          <label class="designer-label">Include Relationship Types</label>
          <div style="max-height:200px; overflow-y:auto; padding:4px; border:1px solid var(--border); border-radius:4px;">
            ${relCheckboxes}
          </div>
        </div>
        <div>
          <label class="designer-label">Example Use Case</label>
          <textarea class="input" id="mode-usecase" rows="2" placeholder="Concrete scenario..."></textarea>
        </div>
        <div style="display:flex; gap:8px; margin-top:8px;">
          <button class="btn btn-primary" onclick="submitNewMode()" style="font-size:12px; padding:6px 16px;">Create Mode</button>
          <button class="btn" onclick="showDesigner()" style="font-size:12px; padding:6px 16px;">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

async function submitNewMode() {
  const mode_id = document.getElementById('mode-id')?.value?.trim();
  const name = document.getElementById('mode-name')?.value?.trim();
  const persona = document.getElementById('mode-persona')?.value?.trim();
  const primary_question = document.getElementById('mode-question')?.value?.trim();
  const default_view_layout = document.getElementById('mode-layout')?.value;
  const example_use_case = document.getElementById('mode-usecase')?.value?.trim();

  if (!mode_id || !name) { showToast('Mode ID and Name are required', 'error'); return; }

  const node_families = [...document.querySelectorAll('.mode-family-cb:checked')].map(cb => cb.value);
  const relationship_types = [...document.querySelectorAll('.mode-rel-cb:checked')].map(cb => cb.value);

  const includes = { node_families, relationship_types, node_kinds: {}, overlays: [] };
  const emphasis_rules = [
    { type: 'collapse', families: Object.keys(NODE_FAMILIES).filter(f => !node_families.includes(f)) }
  ];

  try {
    const resp = await fetch(`${API}/modes`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode_id, name, persona, primary_question, includes, emphasis_rules, default_view_layout, example_use_case }),
    });
    const data = await resp.json();
    if (data.error) { showToast(data.error, 'error'); return; }
    showToast(`Mode "${name}" created`);
    showDesigner();
  } catch (err) { showToast(err.message, 'error'); }
}

// ── Edit Mode Form ──────────────────────────────────────────────

async function showModeEditor(id) {
  const mode = designerModes.find(m => m.id === id);
  if (!mode) return;
  const includedFamilies = new Set(mode.includes?.node_families || []);
  const includedRels = new Set(mode.includes?.relationship_types || []);

  const familyCheckboxes = Object.keys(NODE_FAMILIES).map(f =>
    `<label style="display:flex; align-items:center; gap:4px; font-size:11px; color:var(--text-dim);">
      <input type="checkbox" class="mode-family-cb" value="${f}" ${includedFamilies.has(f) ? 'checked' : ''}> ${f}
    </label>`
  ).join('');

  const relCheckboxes = Object.entries(LINK_TYPES).map(([cat, types]) =>
    `<div style="margin-bottom:4px;">
      <div style="font-size:10px; font-weight:600; color:var(--text); margin-bottom:2px;">${cat}</div>
      ${types.map(t => `<label style="display:inline-flex; align-items:center; gap:3px; font-size:10px; color:var(--text-dim); margin-right:6px;">
        <input type="checkbox" class="mode-rel-cb" value="${t}" ${includedRels.has(t) ? 'checked' : ''}> ${t}
      </label>`).join('')}
    </div>`
  ).join('');

  const body = document.getElementById('main-body');
  body.innerHTML = `
    <div style="max-width:600px;">
      <div style="padding:0 0 12px;">
        <button onclick="showDesigner()" style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;background:none;border:none;color:var(--text-dim);cursor:pointer;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
      </div>
      <h2 style="font-size:16px; font-weight:600; color:var(--text); margin-bottom:12px;">Edit Mode: ${mode.name}</h2>
      <div style="display:flex; flex-direction:column; gap:10px;">
        <div style="display:flex; gap:8px;">
          <div style="flex:1;">
            <label class="designer-label">Name</label>
            <input class="input" id="edit-mode-name" value="${mode.name}" />
          </div>
          <div style="flex:1;">
            <label class="designer-label">Layout</label>
            <select class="input" id="edit-mode-layout">
              <option value="force" ${mode.default_view_layout === 'force' ? 'selected' : ''}>Force</option>
              <option value="hierarchical" ${mode.default_view_layout === 'hierarchical' ? 'selected' : ''}>Hierarchical</option>
              <option value="circular" ${mode.default_view_layout === 'circular' ? 'selected' : ''}>Circular</option>
            </select>
          </div>
        </div>
        <div>
          <label class="designer-label">Persona</label>
          <input class="input" id="edit-mode-persona" value="${mode.persona || ''}" />
        </div>
        <div>
          <label class="designer-label">Primary Question</label>
          <input class="input" id="edit-mode-question" value="${mode.primary_question || ''}" />
        </div>
        <div>
          <label class="designer-label">Include Node Families</label>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:2px; max-height:150px; overflow-y:auto; padding:4px; border:1px solid var(--border); border-radius:4px;">
            ${familyCheckboxes}
          </div>
        </div>
        <div>
          <label class="designer-label">Include Relationship Types</label>
          <div style="max-height:200px; overflow-y:auto; padding:4px; border:1px solid var(--border); border-radius:4px;">
            ${relCheckboxes}
          </div>
        </div>
        <div>
          <label class="designer-label">Example Use Case</label>
          <textarea class="input" id="edit-mode-usecase" rows="2">${mode.example_use_case || ''}</textarea>
        </div>
        <div style="display:flex; gap:8px; margin-top:8px;">
          <button class="btn btn-primary" onclick="submitEditMode(${id})" style="font-size:12px; padding:6px 16px;">Save</button>
          <button class="btn" onclick="showDesigner()" style="font-size:12px; padding:6px 16px;">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

async function submitEditMode(id) {
  const name = document.getElementById('edit-mode-name')?.value?.trim();
  const persona = document.getElementById('edit-mode-persona')?.value?.trim();
  const primary_question = document.getElementById('edit-mode-question')?.value?.trim();
  const default_view_layout = document.getElementById('edit-mode-layout')?.value;
  const example_use_case = document.getElementById('edit-mode-usecase')?.value?.trim();
  const node_families = [...document.querySelectorAll('.mode-family-cb:checked')].map(cb => cb.value);
  const relationship_types = [...document.querySelectorAll('.mode-rel-cb:checked')].map(cb => cb.value);
  const includes = { node_families, relationship_types, node_kinds: {}, overlays: [] };
  const emphasis_rules = [
    { type: 'collapse', families: Object.keys(NODE_FAMILIES).filter(f => !node_families.includes(f)) }
  ];

  try {
    await fetch(`${API}/modes/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, persona, primary_question, includes, emphasis_rules, default_view_layout, example_use_case }),
    });
    showToast('Mode updated');
    showDesigner();
  } catch (err) { showToast(err.message, 'error'); }
}

async function deleteMode(id) {
  if (!confirm('Delete this mode?')) return;
  try {
    const resp = await fetch(`${API}/modes/${id}`, { method: 'DELETE' });
    const data = await resp.json();
    if (data.error) { showToast(data.error, 'error'); return; }
    showToast('Mode deleted');
    await loadDesignerData();
  } catch (err) { showToast(err.message, 'error'); }
}

// ── Template Detail View ────────────────────────────────────────

async function showTemplateDetail(id) {
  const body = document.getElementById('main-body');
  body.innerHTML = '<div style="padding:20px; color:var(--text-dim);">Loading template...</div>';

  try {
    const tmpl = await fetch(`${API}/templates/${id}`).then(r => r.json());
    const isDefault = tmpl.is_default === 'true';
    const nodes = tmpl.nodes || [];
    const edges = tmpl.edges || [];
    const modes = tmpl.modes || [];

    body.innerHTML = `
      <div style="max-width:700px;">
        <div style="padding:0 0 12px;">
          <button onclick="showDesigner()" style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;background:none;border:none;color:var(--text-dim);cursor:pointer;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
        </div>
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
          <h2 style="font-size:16px; font-weight:600; color:var(--text); margin:0;">
            ${isDefault ? '⭐ ' : ''}${tmpl.name} ${tmpl.version ? `<span style="font-size:11px; color:var(--text-muted);">v${tmpl.version}</span>` : ''}
          </h2>
          <div style="display:flex; gap:4px;">
            <button class="btn btn-primary" onclick="applyTemplate(${id})" style="font-size:10px; padding:3px 8px;">Apply</button>
            <button class="btn" onclick="duplicateTemplate(${id})" style="font-size:10px; padding:3px 8px;">Duplicate</button>
          </div>
        </div>
        ${tmpl.description ? `<p style="font-size:12px; color:var(--text-dim); margin-bottom:12px;">${tmpl.description}</p>` : ''}

        <!-- Template Nodes -->
        <div class="card" style="margin-bottom:10px;">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
            <span style="font-size:13px; font-weight:600; color:var(--text);">Nodes (${nodes.length})</span>
            ${!isDefault ? `<button class="btn" onclick="showAddTemplateNode(${id})" style="font-size:10px; padding:2px 8px;">+ Add</button>` : ''}
          </div>
          ${nodes.length === 0 ? '<div style="font-size:11px; color:var(--text-muted);">No nodes in this template.</div>' :
            nodes.map(n => `
              <div style="display:flex; align-items:center; justify-content:space-between; padding:3px 0; border-bottom:1px solid var(--border); font-size:11px;">
                <span><span style="color:var(--text);">${n.name}</span> <span class="badge badge-info" style="font-size:8px;">${n.family}/${n.kind}</span></span>
                ${!isDefault ? `<button onclick="deleteTemplateNode(${id},${n.id})" style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:11px;">✕</button>` : ''}
              </div>
            `).join('')}
        </div>

        <!-- Template Edges -->
        <div class="card" style="margin-bottom:10px;">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
            <span style="font-size:13px; font-weight:600; color:var(--text);">Edges (${edges.length})</span>
            ${!isDefault ? `<button class="btn" onclick="showAddTemplateEdge(${id})" style="font-size:10px; padding:2px 8px;">+ Add</button>` : ''}
          </div>
          ${edges.length === 0 ? '<div style="font-size:11px; color:var(--text-muted);">No edges in this template.</div>' :
            edges.map(e => `
              <div style="display:flex; align-items:center; justify-content:space-between; padding:3px 0; border-bottom:1px solid var(--border); font-size:11px;">
                <span>#${e.source_node_id} <span style="color:#6366f1; font-weight:600;">→ ${e.name} →</span> #${e.target_node_id}</span>
                ${!isDefault ? `<button onclick="deleteTemplateEdge(${id},${e.id})" style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:11px;">✕</button>` : ''}
              </div>
            `).join('')}
        </div>

        <!-- Template Modes -->
        <div class="card" style="margin-bottom:10px;">
          <span style="font-size:13px; font-weight:600; color:var(--text);">Modes (${modes.length})</span>
          ${modes.map(m => `
            <div style="padding:3px 0; border-bottom:1px solid var(--border); font-size:11px;">
              <span style="color:var(--text); font-weight:500;">${m.name}</span>
              <span style="color:var(--text-dim); margin-left:6px;">${m.default_view_layout || ''}</span>
              <div style="font-size:9px; color:var(--text-muted);">${m.primary_question || ''}</div>
            </div>
          `).join('')}
        </div>

        <!-- Ontology Info -->
        ${tmpl.overlays ? `
          <div class="card" style="margin-bottom:10px;">
            <span style="font-size:13px; font-weight:600; color:var(--text);">Overlays</span>
            <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px;">
              ${(tmpl.overlays || []).map(o => `<span class="badge badge-info" style="font-size:9px;">${o}</span>`).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  } catch (err) {
    body.innerHTML = `<div style="color:#ef4444; padding:20px;">${err.message}</div>`;
  }
}

async function showAddTemplateNode(templateId) {
  const familyOptions = Object.keys(NODE_FAMILIES).map(f => `<option value="${f}">${f}</option>`).join('');
  const firstFamily = Object.keys(NODE_FAMILIES)[0];
  const kindOptions = NODE_FAMILIES[firstFamily].map(k => `<option value="${k}">${k}</option>`).join('');

  const body = document.getElementById('main-body');
  body.innerHTML = `
    <div style="max-width:500px;">
      <div style="padding:0 0 12px;"><button onclick="showTemplateDetail(${templateId})" style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;background:none;border:none;color:var(--text-dim);cursor:pointer;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg></button></div>
      <h2 style="font-size:16px; font-weight:600; color:var(--text); margin-bottom:12px;">Add Template Node</h2>
      <div style="display:flex; flex-direction:column; gap:8px;">
        <div><label class="designer-label">Name *</label><input class="input" id="tn-name" /></div>
        <div style="display:flex; gap:8px;">
          <div style="flex:1;"><label class="designer-label">Family *</label><select class="input" id="tn-family" onchange="document.getElementById('tn-kind').innerHTML=NODE_FAMILIES[this.value].map(k=>'<option>'+k+'</option>').join('')">${familyOptions}</select></div>
          <div style="flex:1;"><label class="designer-label">Kind *</label><select class="input" id="tn-kind">${kindOptions}</select></div>
        </div>
        <div style="display:flex; gap:8px; margin-top:8px;">
          <button class="btn btn-primary" onclick="submitTemplateNode(${templateId})" style="font-size:12px; padding:6px 16px;">Add</button>
          <button class="btn" onclick="showTemplateDetail(${templateId})" style="font-size:12px; padding:6px 16px;">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

async function submitTemplateNode(templateId) {
  const name = document.getElementById('tn-name')?.value?.trim();
  const family = document.getElementById('tn-family')?.value;
  const kind = document.getElementById('tn-kind')?.value;
  if (!name || !family || !kind) { showToast('Name, family, kind required', 'error'); return; }
  try {
    await fetch(`${API}/templates/${templateId}/nodes`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, unique_id: slugify(name), family, kind, short_name: name }),
    });
    showToast('Node added to template');
    showTemplateDetail(templateId);
  } catch (err) { showToast(err.message, 'error'); }
}

async function deleteTemplateNode(templateId, nodeId) {
  try {
    await fetch(`${API}/templates/${templateId}/nodes/${nodeId}`, { method: 'DELETE' });
    showToast('Node removed');
    showTemplateDetail(templateId);
  } catch (err) { showToast(err.message, 'error'); }
}

async function showAddTemplateEdge(templateId) {
  const nodes = await fetch(`${API}/templates/${templateId}/nodes`).then(r => r.json()).catch(() => []);
  const nodeOpts = nodes.map(n => `<option value="${n.id}">${n.name} [${n.family}/${n.kind}]</option>`).join('');
  let linkOptions = '';
  for (const [cat, types] of Object.entries(LINK_TYPES)) {
    linkOptions += `<optgroup label="${cat}">${types.map(t => `<option value="${t}">${t}</option>`).join('')}</optgroup>`;
  }

  const body = document.getElementById('main-body');
  body.innerHTML = `
    <div style="max-width:500px;">
      <div style="padding:0 0 12px;"><button onclick="showTemplateDetail(${templateId})" style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;background:none;border:none;color:var(--text-dim);cursor:pointer;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg></button></div>
      <h2 style="font-size:16px; font-weight:600; color:var(--text); margin-bottom:12px;">Add Template Edge</h2>
      <div style="display:flex; flex-direction:column; gap:8px;">
        <div><label class="designer-label">Relationship *</label><select class="input" id="te-name">${linkOptions}</select></div>
        <div><label class="designer-label">From (Source) *</label><select class="input" id="te-source">${nodeOpts}</select></div>
        <div><label class="designer-label">To (Target) *</label><select class="input" id="te-target">${nodeOpts}</select></div>
        <div style="display:flex; gap:8px; margin-top:8px;">
          <button class="btn btn-primary" onclick="submitTemplateEdge(${templateId})" style="font-size:12px; padding:6px 16px;">Add</button>
          <button class="btn" onclick="showTemplateDetail(${templateId})" style="font-size:12px; padding:6px 16px;">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

async function submitTemplateEdge(templateId) {
  const name = document.getElementById('te-name')?.value;
  const source_node_id = parseInt(document.getElementById('te-source')?.value);
  const target_node_id = parseInt(document.getElementById('te-target')?.value);
  if (!name || !source_node_id || !target_node_id) { showToast('All fields required', 'error'); return; }
  try {
    await fetch(`${API}/templates/${templateId}/edges`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, source_node_id, target_node_id, relationship_type: name }),
    });
    showToast('Edge added to template');
    showTemplateDetail(templateId);
  } catch (err) { showToast(err.message, 'error'); }
}

async function deleteTemplateEdge(templateId, edgeId) {
  try {
    await fetch(`${API}/templates/${templateId}/edges/${edgeId}`, { method: 'DELETE' });
    showToast('Edge removed');
    showTemplateDetail(templateId);
  } catch (err) { showToast(err.message, 'error'); }
}

// ── Template Edit Form ──────────────────────────────────────────

async function showEditTemplate(id) {
  const tmpl = designerTemplates.find(t => t.id === id);
  if (!tmpl) return;
  const body = document.getElementById('main-body');
  body.innerHTML = `
    <div style="max-width:500px;">
      <div style="padding:0 0 12px;"><button onclick="showDesigner()" style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;background:none;border:none;color:var(--text-dim);cursor:pointer;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg></button></div>
      <h2 style="font-size:16px; font-weight:600; color:var(--text); margin-bottom:12px;">Edit Template</h2>
      <div style="display:flex; flex-direction:column; gap:10px;">
        <div><label class="designer-label">Name</label><input class="input" id="edit-tmpl-name" value="${tmpl.name}" /></div>
        <div><label class="designer-label">Description</label><textarea class="input" id="edit-tmpl-desc" rows="3">${tmpl.description || ''}</textarea></div>
        <div><label class="designer-label">Purpose</label><textarea class="input" id="edit-tmpl-purpose" rows="2">${tmpl.purpose || ''}</textarea></div>
        <div style="display:flex; gap:8px; margin-top:8px;">
          <button class="btn btn-primary" onclick="submitEditTemplate(${id})" style="font-size:12px; padding:6px 16px;">Save</button>
          <button class="btn" onclick="showDesigner()" style="font-size:12px; padding:6px 16px;">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

async function submitEditTemplate(id) {
  const name = document.getElementById('edit-tmpl-name')?.value?.trim();
  const description = document.getElementById('edit-tmpl-desc')?.value?.trim();
  const purpose = document.getElementById('edit-tmpl-purpose')?.value?.trim();
  try {
    await fetch(`${API}/templates/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, purpose }),
    });
    showToast('Template updated');
    showDesigner();
  } catch (err) { showToast(err.message, 'error'); }
}

// ── Create Composition Form ─────────────────────────────────────

async function showCreateComposition() {
  const modes = await fetch(`${API}/modes`).then(r => r.json()).catch(() => []);
  const modeCheckboxes = modes.map(m =>
    `<label style="display:flex; align-items:center; gap:4px; font-size:11px; color:var(--text-dim);">
      <input type="checkbox" class="comp-mode-cb" value="${m.mode_id}"> ${m.name} (${m.mode_id})
    </label>`
  ).join('');

  const body = document.getElementById('main-body');
  body.innerHTML = `
    <div style="max-width:500px;">
      <div style="padding:0 0 12px;"><button onclick="showDesigner()" style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;background:none;border:none;color:var(--text-dim);cursor:pointer;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg></button></div>
      <h2 style="font-size:16px; font-weight:600; color:var(--text); margin-bottom:12px;">New Mode Composition</h2>
      <div style="display:flex; flex-direction:column; gap:10px;">
        <div><label class="designer-label">Name *</label><input class="input" id="comp-name" placeholder="e.g. security+ops" /></div>
        <div>
          <label class="designer-label">Select Modes to Combine *</label>
          <div style="padding:6px; border:1px solid var(--border); border-radius:4px; max-height:200px; overflow-y:auto;">
            ${modeCheckboxes}
          </div>
        </div>
        <div style="display:flex; gap:8px;">
          <div style="flex:1;">
            <label class="designer-label">Merge Strategy</label>
            <select class="input" id="comp-strategy">
              <option value="union">Union (show all)</option>
              <option value="intersection">Intersection (show common)</option>
            </select>
          </div>
          <div style="flex:1;">
            <label class="designer-label">Conflict Resolution</label>
            <input class="input" id="comp-conflict" placeholder="e.g. diagnosis" />
          </div>
        </div>
        <div>
          <label class="designer-label">Zoom Level</label>
          <select class="input" id="comp-zoom">
            <option value="file">File</option>
            <option value="module">Module</option>
            <option value="service">Service</option>
            <option value="system">System</option>
          </select>
        </div>
        <div style="display:flex; gap:8px; margin-top:8px;">
          <button class="btn btn-primary" onclick="submitNewComposition()" style="font-size:12px; padding:6px 16px;">Create</button>
          <button class="btn" onclick="showDesigner()" style="font-size:12px; padding:6px 16px;">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

async function submitNewComposition() {
  const name = document.getElementById('comp-name')?.value?.trim();
  const mode_ids = [...document.querySelectorAll('.comp-mode-cb:checked')].map(cb => cb.value);
  const merge_strategy = document.getElementById('comp-strategy')?.value;
  const conflict_resolution = document.getElementById('comp-conflict')?.value?.trim();
  const zoom_level = document.getElementById('comp-zoom')?.value;

  if (!name || mode_ids.length < 2) { showToast('Name required and select at least 2 modes', 'error'); return; }

  try {
    await fetch(`${API}/modes/compose`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mode_ids, merge_strategy, conflict_resolution: conflict_resolution || null, zoom_level }),
    });
    showToast(`Composition "${name}" created`);
    showDesigner();
  } catch (err) { showToast(err.message, 'error'); }
}
