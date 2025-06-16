import{H as w,g as L,d as I,s as T,a as N,i as Y,b as P,c as z,e as S,f as B,h as F,j as V,k as G,l as W,m as J,n as K,o as Q,p as X,q as Z,r as $,t as tt,u as et,L as nt,v as j,w as st,x as rt,y as at,z as it,A as ot,C as lt}from"./index.js";import"clsx";let k="",R=k;const Et="_app",C={base:k,assets:R};function Ot(t){k=t.base,R=t.assets}function Pt(){k=C.base,R=C.assets}function Tt(t){R=C.assets=t}let ct={},ut={};function Nt(t){}function jt(t){ct=t}function At(t){ut=t}function q(t){console.warn("https://svelte.dev/e/hydration_mismatch")}let x=!1;function y(t){x=t}let m;function E(t){if(t===null)throw q(),w;return m=t}function dt(){return E(L(m))}const ft=["touchstart","touchmove"];function ht(t){return ft.includes(t)}const _t=new Set,A=new Set;function b(t){var e=this,r=e.ownerDocument,i=t.type,a=t.composedPath?.()||[],n=a[0]||t.target,s=0,o=t.__root;if(o){var d=a.indexOf(o);if(d!==-1&&(e===document||e===window)){t.__root=e;return}var f=a.indexOf(e);if(f===-1)return;d<=f&&(s=d)}if(n=a[s]||t.target,n!==e){I(t,"currentTarget",{configurable:!0,get(){return n||r}});var h=z,c=P;T(null),N(null);try{for(var l,u=[];n!==null;){var v=n.assignedSlot||n.parentNode||n.host||null;try{var _=n["__"+i];if(_!=null&&(!n.disabled||t.target===n))if(Y(_)){var[M,...U]=_;M.apply(n,[t,...U])}else _.call(n,t)}catch(p){l?u.push(p):l=p}if(t.cancelBubble||v===e||v===null)break;n=v}if(l){for(let p of u)queueMicrotask(()=>{throw p});throw l}}finally{t.__root=e,delete t.currentTarget,T(h),N(c)}}}function mt(t,e){var r=P;r.nodes_start===null&&(r.nodes_start=t,r.nodes_end=e)}function D(t,e){return H(t,e)}function vt(t,e){S(),e.intro=e.intro??!1;const r=e.target,i=x,a=m;try{for(var n=B(r);n&&(n.nodeType!==8||n.data!==F);)n=L(n);if(!n)throw w;y(!0),E(n),dt();const s=H(t,{...e,anchor:n});if(m===null||m.nodeType!==8||m.data!==V)throw q(),w;return y(!1),s}catch(s){if(s===w)return e.recover===!1&&G(),S(),W(r),y(!1),D(t,e);throw s}finally{y(i),E(a)}}const g=new Map;function H(t,{target:e,anchor:r,props:i={},events:a,context:n,intro:s=!0}){S();var o=new Set,d=c=>{for(var l=0;l<c.length;l++){var u=c[l];if(!o.has(u)){o.add(u);var v=ht(u);e.addEventListener(u,b,{passive:v});var _=g.get(u);_===void 0?(document.addEventListener(u,b,{passive:v}),g.set(u,1)):g.set(u,_+1)}}};d(J(_t)),A.add(d);var f=void 0,h=K(()=>{var c=r??e.appendChild(Q());return X(()=>{if(n){Z({});var l=$;l.c=n}a&&(i.$$events=a),x&&mt(c,null),f=t(c,i)||{},x&&(P.nodes_end=m),n&&tt()}),()=>{for(var l of o){e.removeEventListener(l,b);var u=g.get(l);--u===0?(document.removeEventListener(l,b),g.delete(l)):g.set(l,u)}A.delete(d),c!==r&&c.parentNode?.removeChild(c)}});return O.set(f,h),f}let O=new WeakMap;function gt(t,e){const r=O.get(t);return r?(O.delete(t),r(e)):Promise.resolve()}function pt(t){return class extends yt{constructor(e){super({component:t,...e})}}}class yt{#e;#t;constructor(e){var r=new Map,i=(n,s)=>{var o=rt(s);return r.set(n,o),o};const a=new Proxy({...e.props||{},$$events:{}},{get(n,s){return j(r.get(s)??i(s,Reflect.get(n,s)))},has(n,s){return s===nt?!0:(j(r.get(s)??i(s,Reflect.get(n,s))),Reflect.has(n,s))},set(n,s,o){return et(r.get(s)??i(s,o),o),Reflect.set(n,s,o)}});this.#t=(e.hydrate?vt:D)(e.component,{target:e.target,anchor:e.anchor,props:a,context:e.context,intro:e.intro??!1,recover:e.recover}),(!e?.props?.$$host||e.sync===!1)&&st(),this.#e=a.$$events;for(const n of Object.keys(this.#t))n==="$set"||n==="$destroy"||n==="$on"||I(this,n,{get(){return this.#t[n]},set(s){this.#t[n]=s},enumerable:!0});this.#t.$set=n=>{Object.assign(a,n)},this.#t.$destroy=()=>{gt(this.#t)}}$set(e){this.#t.$set(e)}$on(e,r){this.#e[e]=this.#e[e]||[];const i=(...a)=>r.call(this,...a);return this.#e[e].push(i),()=>{this.#e[e]=this.#e[e].filter(a=>a!==i)}}$destroy(){this.#t.$destroy()}}let bt=null;function Lt(t){bt=t}function It(t){}function wt(t){const e=pt(t),r=(i,{context:a}={})=>{const n=at(t,{props:i,context:a});return{css:{code:"",map:null},head:n.head,html:n.body}};return e.render=r,e}let xt=!1;function qt(){}function Dt(){xt=!0}function kt(t,e){it();let{stores:r,page:i,constructors:a,components:n=[],form:s,data_0:o=null,data_1:d=null}=e;ot("__svelte__",r),r.page.set(i);const f=a[1];if(a[1]){t.out+="<!--[-->";const h=a[0];t.out+="<!---->",h(t,{data:o,form:s,children:c=>{c.out+="<!---->",f(c,{data:d,form:s}),c.out+="<!---->"},$$slots:{default:!0}}),t.out+="<!---->"}else{t.out+="<!--[!-->";const h=a[0];t.out+="<!---->",h(t,{data:o,form:s}),t.out+="<!---->"}t.out+="<!--]--> ",t.out+="<!--[!-->",t.out+="<!--]-->",lt()}const Rt=wt(kt),Ht={app_template_contains_nonce:!1,csp:{mode:"auto",directives:{"upgrade-insecure-requests":!1,"block-all-mixed-content":!1},reportOnly:{"upgrade-insecure-requests":!1,"block-all-mixed-content":!1}},csrf_check_origin:!0,embedded:!1,env_public_prefix:"PUBLIC_",env_private_prefix:"",hash_routing:!1,hooks:null,preload_strategy:"modulepreload",root:Rt,service_worker:!1,templates:{app:({head:t,body:e,assets:r,nonce:i,env:a})=>`<!doctype html>
<html lang="en" class="dark">
	<head>
		<meta charset="utf-8" />
		<link rel="icon" href="`+r+`/favicon.png" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<meta name="color-scheme" content="dark" />
		<title>Underleaf</title>
		`+t+`
	</head>
	<body data-sveltekit-preload-data="hover">
		<div style="display: contents">`+e+`</div>
	</body>
</html>
`,error:({status:t,message:e})=>`<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<title>`+e+`</title>

		<style>
			body {
				--bg: white;
				--fg: #222;
				--divider: #ccc;
				background: var(--bg);
				color: var(--fg);
				font-family:
					system-ui,
					-apple-system,
					BlinkMacSystemFont,
					'Segoe UI',
					Roboto,
					Oxygen,
					Ubuntu,
					Cantarell,
					'Open Sans',
					'Helvetica Neue',
					sans-serif;
				display: flex;
				align-items: center;
				justify-content: center;
				height: 100vh;
				margin: 0;
			}

			.error {
				display: flex;
				align-items: center;
				max-width: 32rem;
				margin: 0 1rem;
			}

			.status {
				font-weight: 200;
				font-size: 3rem;
				line-height: 1;
				position: relative;
				top: -0.05rem;
			}

			.message {
				border-left: 1px solid var(--divider);
				padding: 0 0 0 1rem;
				margin: 0 0 0 1rem;
				min-height: 2.5rem;
				display: flex;
				align-items: center;
			}

			.message h1 {
				font-weight: 400;
				font-size: 1em;
				margin: 0;
			}

			@media (prefers-color-scheme: dark) {
				body {
					--bg: #222;
					--fg: #ddd;
					--divider: #666;
				}
			}
		</style>
	</head>
	<body>
		<div class="error">
			<span class="status">`+t+`</span>
			<div class="message">
				<h1>`+e+`</h1>
			</div>
		</div>
	</body>
</html>
`},version_hash:"2xjhfj"};async function Mt(){return{handle:void 0,handleFetch:void 0,handleError:void 0,init:void 0,reroute:void 0,transport:void 0}}export{R as a,k as b,Et as c,bt as d,Ht as e,Nt as f,Mt as g,xt as h,jt as i,At as j,Lt as k,Tt as l,qt as m,It as n,Ot as o,ct as p,Dt as q,Pt as r,ut as s};
//# sourceMappingURL=internal.js.map
