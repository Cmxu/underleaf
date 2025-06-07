import{o as le,a as ie,g as V,b as ae,i as Ot,s as ue,e as fe,c as Tt,r as Dt,d as oe,f as At,h as ce}from"./equality.js";import{U as g,H as X,a as _e,b as ve,r as de,p as he,s as pe,c as ge}from"./index.js";import"clsx";const Rt=!1;let at="",ut=at;const xn="_app",vt={base:at,assets:ut};function kn(t){at=t.base,ut=t.assets}function Tn(){at=vt.base,ut=vt.assets}function Rn(t){ut=vt.assets=t}let me={},we={};function Nn(t){}function Cn(t){me=t}function Sn(t){we=t}const N=2,It=4,Pt=8,qt=16,M=32,j=64,yt=128,x=256,tt=512,y=1024,F=2048,B=4096,et=8192,bt=16384,Mt=32768,ye=65536,be=1<<19,Ee=1<<20,dt=1<<21,ct=Symbol("$state"),xe=Symbol("legacy props");function ke(){throw new Error("https://svelte.dev/e/effect_update_depth_exceeded")}function Te(){throw new Error("https://svelte.dev/e/hydration_failed")}function Re(){throw new Error("https://svelte.dev/e/state_descriptors_fixed")}function Ne(){throw new Error("https://svelte.dev/e/state_prototype_fixed")}function Ce(){throw new Error("https://svelte.dev/e/state_unsafe_mutation")}let Se=!1,O=null;function Nt(t){O=t}function Fe(t,e=!1,n){var s=O={p:O,c:null,d:!1,e:null,m:!1,s:t,x:null,l:null};Ue(()=>{s.d=!0})}function Oe(t){const e=O;if(e!==null){const i=e.e;if(i!==null){var n=h,s=d;e.e=null;try{for(var l=0;l<i.length;l++){var r=i[l];H(r.effect),D(r.reaction),He(r.fn)}}finally{H(n),D(s)}}O=e.p,e.m=!0}return{}}function Bt(){return!0}function U(t){if(typeof t!="object"||t===null||ct in t)return t;const e=ae(t);if(e!==le&&e!==ie)return t;var n=new Map,s=Ot(t),l=C(0),r=d,i=f=>{var a=d;D(r);var u=f();return D(a),u};return s&&n.set("length",C(t.length)),new Proxy(t,{defineProperty(f,a,u){(!("value"in u)||u.configurable===!1||u.enumerable===!1||u.writable===!1)&&Re();var _=n.get(a);return _===void 0?(_=i(()=>C(u.value)),n.set(a,_)):T(_,i(()=>U(u.value))),!0},deleteProperty(f,a){var u=n.get(a);if(u===void 0)a in f&&(n.set(a,i(()=>C(g))),_t(l));else{if(s&&typeof a=="string"){var _=n.get("length"),o=Number(a);Number.isInteger(o)&&o<_.v&&T(_,o)}T(u,g),_t(l)}return!0},get(f,a,u){if(a===ct)return t;var _=n.get(a),o=a in f;if(_===void 0&&(!o||V(f,a)?.writable)&&(_=i(()=>C(U(o?f[a]:g))),n.set(a,_)),_!==void 0){var c=Y(_);return c===g?void 0:c}return Reflect.get(f,a,u)},getOwnPropertyDescriptor(f,a){var u=Reflect.getOwnPropertyDescriptor(f,a);if(u&&"value"in u){var _=n.get(a);_&&(u.value=Y(_))}else if(u===void 0){var o=n.get(a),c=o?.v;if(o!==void 0&&c!==g)return{enumerable:!0,configurable:!0,value:c,writable:!0}}return u},has(f,a){if(a===ct)return!0;var u=n.get(a),_=u!==void 0&&u.v!==g||Reflect.has(f,a);if(u!==void 0||h!==null&&(!_||V(f,a)?.writable)){u===void 0&&(u=i(()=>C(_?U(f[a]):g)),n.set(a,u));var o=Y(u);if(o===g)return!1}return _},set(f,a,u,_){var o=n.get(a),c=a in f;if(s&&a==="length")for(var v=u;v<o.v;v+=1){var b=n.get(v+"");b!==void 0?T(b,g):v in f&&(b=i(()=>C(g)),n.set(v+"",b))}o===void 0?(!c||V(f,a)?.writable)&&(o=i(()=>C(void 0)),T(o,i(()=>U(u))),n.set(a,o)):(c=o.v!==g,T(o,i(()=>U(u))));var E=Reflect.getOwnPropertyDescriptor(f,a);if(E?.set&&E.set.call(_,u),!c){if(s&&typeof a=="string"){var Z=n.get("length"),K=Number(a);Number.isInteger(K)&&K>=Z.v&&T(Z,K+1)}_t(l)}return!0},ownKeys(f){Y(l);var a=Reflect.ownKeys(f).filter(o=>{var c=n.get(o);return c===void 0||c.v!==g});for(var[u,_]of n)_.v!==g&&!(u in f)&&a.push(u);return a},setPrototypeOf(){Ne()}})}function _t(t,e=1){T(t,t.v+e)}function Lt(t){var e=t.effects;if(e!==null){t.effects=null;for(var n=0;n<e.length;n+=1)q(e[n])}}function De(t){for(var e=t.parent;e!==null;){if(!(e.f&N))return e;e=e.parent}return null}function Ut(t){var e,n=h;H(De(t));try{Lt(t),e=ee(t)}finally{H(n)}return e}function Yt(t){var e=Ut(t);if(t.equals(e)||(t.v=e,t.wv=Xt()),!G){var n=(S||t.f&x)&&t.deps!==null?B:y;k(t,n)}}const z=new Map;function Ht(t,e){var n={f:0,v:t,reactions:null,equals:fe,rv:0,wv:0};return n}function C(t,e){const n=Ht(t);return Qe(n),n}function Ae(t,e=!1){const n=Ht(t);return e||(n.equals=ue),n}function T(t,e,n=!1){d!==null&&!A&&Bt()&&d.f&(N|qt)&&!R?.includes(t)&&Ce();let s=n?U(e):e;return Ie(t,s)}function Ie(t,e){if(!t.equals(e)){var n=t.v;G?z.set(t,e):z.set(t,n),t.v=e,t.f&N&&(t.f&F&&Ut(t),k(t,t.f&x?B:y)),t.wv=Xt(),jt(t,F),h!==null&&h.f&y&&!(h.f&(M|j))&&(w===null?Xe([t]):w.push(t))}return e}function jt(t,e){var n=t.reactions;if(n!==null)for(var s=n.length,l=0;l<s;l++){var r=n[l],i=r.f;i&F||(k(r,e),i&(y|x)&&(i&N?jt(r,B):kt(r)))}}function Kt(t){console.warn("https://svelte.dev/e/hydration_mismatch")}let nt=!1;function J(t){nt=t}let I;function ht(t){if(t===null)throw Kt(),X;return I=t}function Pe(){return ht(Et(I))}var Ct,Vt,Wt;function pt(){if(Ct===void 0){Ct=window;var t=Element.prototype,e=Node.prototype,n=Text.prototype;Vt=V(e,"firstChild").get,Wt=V(e,"nextSibling").get,Tt(t)&&(t.__click=void 0,t.__className=void 0,t.__attributes=null,t.__style=void 0,t.__e=void 0),Tt(n)&&(n.__t=void 0)}}function qe(t=""){return document.createTextNode(t)}function Me(t){return Vt.call(t)}function Et(t){return Wt.call(t)}function Be(t){t.textContent=""}function Le(t,e){var n=e.last;n===null?e.last=e.first=t:(n.next=t,t.prev=n,e.last=t)}function ft(t,e,n,s=!0){var l=h,r={ctx:O,deps:null,nodes_start:null,nodes_end:null,f:t|F,first:null,fn:e,last:null,next:null,parent:l,prev:null,teardown:null,transitions:null,wv:0};if(n)try{xt(r),r.f|=Mt}catch(a){throw q(r),a}else e!==null&&kt(r);var i=n&&r.deps===null&&r.first===null&&r.nodes_start===null&&r.teardown===null&&(r.f&(Ee|yt))===0;if(!i&&s&&(l!==null&&Le(r,l),d!==null&&d.f&N)){var f=d;(f.effects??=[]).push(r)}return r}function Ue(t){const e=ft(Pt,null,!1);return k(e,y),e.teardown=t,e}function Ye(t){const e=ft(j,t,!0);return(n={})=>new Promise(s=>{n.outro?We(e,()=>{q(e),s(void 0)}):(q(e),s(void 0))})}function He(t){return ft(It,t,!1)}function je(t,e=!0){return ft(Pt|M,t,!0,e)}function zt(t){var e=t.teardown;if(e!==null){const n=G,s=d;St(!0),D(null);try{e.call(null)}finally{St(n),D(s)}}}function Gt(t,e=!1){var n=t.first;for(t.first=t.last=null;n!==null;){var s=n.next;n.f&j?n.parent=null:q(n,e),n=s}}function Ke(t){for(var e=t.first;e!==null;){var n=e.next;e.f&M||q(e),e=n}}function q(t,e=!0){var n=!1;(e||t.f&be)&&t.nodes_start!==null&&t.nodes_end!==null&&(Ve(t.nodes_start,t.nodes_end),n=!0),Gt(t,e&&!n),it(t,0),k(t,bt);var s=t.transitions;if(s!==null)for(const r of s)r.stop();zt(t);var l=t.parent;l!==null&&l.first!==null&&Zt(t),t.next=t.prev=t.teardown=t.ctx=t.deps=t.fn=t.nodes_start=t.nodes_end=null}function Ve(t,e){for(;t!==null;){var n=t===e?null:Et(t);t.remove(),t=n}}function Zt(t){var e=t.parent,n=t.prev,s=t.next;n!==null&&(n.next=s),s!==null&&(s.prev=n),e!==null&&(e.first===t&&(e.first=s),e.last===t&&(e.last=n))}function We(t,e){var n=[];$t(t,n,!0),ze(n,()=>{q(t),e&&e()})}function ze(t,e){var n=t.length;if(n>0){var s=()=>--n||e();for(var l of t)l.out(s)}else e()}function $t(t,e,n){if(!(t.f&et)){if(t.f^=et,t.transitions!==null)for(const i of t.transitions)(i.is_global||n)&&e.push(i);for(var s=t.first;s!==null;){var l=s.next,r=(s.f&ye)!==0||(s.f&M)!==0;$t(s,e,r?n:!1),s=l}}}let gt=[],mt=[];function Ge(){var t=gt;gt=[],Dt(t)}function Ze(){var t=mt;mt=[],Dt(t)}function $e(){gt.length>0&&Ge(),mt.length>0&&Ze()}function Je(t){var e=h;if(e.f&Mt)Jt(t,e);else{if(!(e.f&yt))throw t;e.fn(t)}}function Jt(t,e){for(;e!==null;){if(e.f&yt)try{e.fn(t);return}catch{}e=e.parent}throw t}let rt=!1,st=null,P=!1,G=!1;function St(t){G=t}let W=[];let d=null,A=!1;function D(t){d=t}let h=null;function H(t){h=t}let R=null;function Qe(t){d!==null&&d.f&dt&&(R===null?R=[t]:R.push(t))}let p=null,m=0,w=null;function Xe(t){w=t}let Qt=1,lt=0,S=!1;function Xt(){return++Qt}function ot(t){var e=t.f;if(e&F)return!0;if(e&B){var n=t.deps,s=(e&x)!==0;if(n!==null){var l,r,i=(e&tt)!==0,f=s&&h!==null&&!S,a=n.length;if(i||f){var u=t,_=u.parent;for(l=0;l<a;l++)r=n[l],(i||!r?.reactions?.includes(u))&&(r.reactions??=[]).push(u);i&&(u.f^=tt),f&&_!==null&&!(_.f&x)&&(u.f^=x)}for(l=0;l<a;l++)if(r=n[l],ot(r)&&Yt(r),r.wv>t.wv)return!0}(!s||h!==null&&!S)&&k(t,y)}return!1}function te(t,e,n=!0){var s=t.reactions;if(s!==null)for(var l=0;l<s.length;l++){var r=s[l];R?.includes(t)||(r.f&N?te(r,e,!1):e===r&&(n?k(r,F):r.f&y&&k(r,B),kt(r)))}}function ee(t){var e=p,n=m,s=w,l=d,r=S,i=R,f=O,a=A,u=t.f;p=null,m=0,w=null,S=(u&x)!==0&&(A||!P||d===null),d=u&(M|j)?null:t,R=null,Nt(t.ctx),A=!1,lt++,t.f|=dt;try{var _=(0,t.fn)(),o=t.deps;if(p!==null){var c;if(it(t,m),o!==null&&m>0)for(o.length=m+p.length,c=0;c<p.length;c++)o[m+c]=p[c];else t.deps=o=p;if(!S)for(c=m;c<o.length;c++)(o[c].reactions??=[]).push(t)}else o!==null&&m<o.length&&(it(t,m),o.length=m);if(Bt()&&w!==null&&!A&&o!==null&&!(t.f&(N|B|F)))for(c=0;c<w.length;c++)te(w[c],t);return l!==null&&l!==t&&(lt++,w!==null&&(s===null?s=w:s.push(...w))),_}catch(v){Je(v)}finally{p=e,m=n,w=s,d=l,S=r,R=i,Nt(f),A=a,t.f^=dt}}function tn(t,e){let n=e.reactions;if(n!==null){var s=oe.call(n,t);if(s!==-1){var l=n.length-1;l===0?n=e.reactions=null:(n[s]=n[l],n.pop())}}n===null&&e.f&N&&(p===null||!p.includes(e))&&(k(e,B),e.f&(x|tt)||(e.f^=tt),Lt(e),it(e,0))}function it(t,e){var n=t.deps;if(n!==null)for(var s=e;s<n.length;s++)tn(t,n[s])}function xt(t){var e=t.f;if(!(e&bt)){k(t,y);var n=h,s=P;h=t,P=!0;try{e&qt?Ke(t):Gt(t),zt(t);var l=ee(t);t.teardown=typeof l=="function"?l:null,t.wv=Qt;var r=t.deps,i;Rt&&Se&&t.f&F}finally{P=s,h=n}}}function en(){try{ke()}catch(t){if(st!==null)Jt(t,st);else throw t}}function ne(){var t=P;try{var e=0;for(P=!0;W.length>0;){e++>1e3&&en();var n=W,s=n.length;W=[];for(var l=0;l<s;l++){var r=rn(n[l]);nn(r)}z.clear()}}finally{rt=!1,P=t,st=null}}function nn(t){var e=t.length;if(e!==0)for(var n=0;n<e;n++){var s=t[n];s.f&(bt|et)||ot(s)&&(xt(s),s.deps===null&&s.first===null&&s.nodes_start===null&&(s.teardown===null?Zt(s):s.fn=null))}}function kt(t){rt||(rt=!0,queueMicrotask(ne));for(var e=st=t;e.parent!==null;){e=e.parent;var n=e.f;if(n&(j|M)){if(!(n&y))return;e.f^=y}}W.push(e)}function rn(t){for(var e=[],n=t;n!==null;){var s=n.f,l=(s&(M|j))!==0,r=l&&(s&y)!==0;if(!r&&!(s&et)){s&It?e.push(n):l?n.f^=y:ot(n)&&xt(n);var i=n.first;if(i!==null){n=i;continue}}var f=n.parent;for(n=n.next;n===null&&f!==null;)n=f.next,f=f.parent}return e}function sn(t){for(var e;;){if($e(),W.length===0)return e;rt=!0,ne()}}function Y(t){var e=t.f,n=(e&N)!==0;if(d!==null&&!A){if(!R?.includes(t)){var s=d.deps;t.rv<lt&&(t.rv=lt,p===null&&s!==null&&s[m]===t?m++:p===null?p=[t]:(!S||!p.includes(t))&&p.push(t))}}else if(n&&t.deps===null&&t.effects===null){var l=t,r=l.parent;r!==null&&!(r.f&x)&&(l.f^=x)}return n&&(l=t,ot(l)&&Yt(l)),G&&z.has(t)?z.get(t):t.v}const ln=-7169;function k(t,e){t.f=t.f&ln|e}const an=["touchstart","touchmove"];function un(t){return an.includes(t)}const fn=new Set,Ft=new Set;function Q(t){var e=this,n=e.ownerDocument,s=t.type,l=t.composedPath?.()||[],r=l[0]||t.target,i=0,f=t.__root;if(f){var a=l.indexOf(f);if(a!==-1&&(e===document||e===window)){t.__root=e;return}var u=l.indexOf(e);if(u===-1)return;a<=u&&(i=a)}if(r=l[i]||t.target,r!==e){At(t,"currentTarget",{configurable:!0,get(){return r||n}});var _=d,o=h;D(null),H(null);try{for(var c,v=[];r!==null;){var b=r.assignedSlot||r.parentNode||r.host||null;try{var E=r["__"+s];if(E!=null&&(!r.disabled||t.target===r))if(Ot(E)){var[Z,...K]=E;Z.apply(r,[t,...K])}else E.call(r,t)}catch($){c?v.push($):c=$}if(t.cancelBubble||b===e||b===null)break;r=b}if(c){for(let $ of v)queueMicrotask(()=>{throw $});throw c}}finally{t.__root=e,delete t.currentTarget,D(_),H(o)}}}function on(t,e){var n=h;n.nodes_start===null&&(n.nodes_start=t,n.nodes_end=e)}function re(t,e){return se(t,e)}function cn(t,e){pt(),e.intro=e.intro??!1;const n=e.target,s=nt,l=I;try{for(var r=Me(n);r&&(r.nodeType!==8||r.data!==_e);)r=Et(r);if(!r)throw X;J(!0),ht(r),Pe();const i=se(t,{...e,anchor:r});if(I===null||I.nodeType!==8||I.data!==ve)throw Kt(),X;return J(!1),i}catch(i){if(i===X)return e.recover===!1&&Te(),pt(),Be(n),J(!1),re(t,e);throw i}finally{J(s),ht(l)}}const L=new Map;function se(t,{target:e,anchor:n,props:s={},events:l,context:r,intro:i=!0}){pt();var f=new Set,a=o=>{for(var c=0;c<o.length;c++){var v=o[c];if(!f.has(v)){f.add(v);var b=un(v);e.addEventListener(v,Q,{passive:b});var E=L.get(v);E===void 0?(document.addEventListener(v,Q,{passive:b}),L.set(v,1)):L.set(v,E+1)}}};a(ce(fn)),Ft.add(a);var u=void 0,_=Ye(()=>{var o=n??e.appendChild(qe());return je(()=>{if(r){Fe({});var c=O;c.c=r}l&&(s.$$events=l),nt&&on(o,null),u=t(o,s)||{},nt&&(h.nodes_end=I),r&&Oe()}),()=>{for(var c of f){e.removeEventListener(c,Q);var v=L.get(c);--v===0?(document.removeEventListener(c,Q),L.delete(c)):L.set(c,v)}Ft.delete(a),o!==n&&o.parentNode?.removeChild(o)}});return wt.set(u,_),u}let wt=new WeakMap;function _n(t,e){const n=wt.get(t);return n?(wt.delete(t),n(e)):Promise.resolve()}function vn(t){return class extends dn{constructor(e){super({component:t,...e})}}}class dn{#e;#t;constructor(e){var n=new Map,s=(r,i)=>{var f=Ae(i);return n.set(r,f),f};const l=new Proxy({...e.props||{},$$events:{}},{get(r,i){return Y(n.get(i)??s(i,Reflect.get(r,i)))},has(r,i){return i===xe?!0:(Y(n.get(i)??s(i,Reflect.get(r,i))),Reflect.has(r,i))},set(r,i,f){return T(n.get(i)??s(i,f),f),Reflect.set(r,i,f)}});this.#t=(e.hydrate?cn:re)(e.component,{target:e.target,anchor:e.anchor,props:l,context:e.context,intro:e.intro??!1,recover:e.recover}),(!e?.props?.$$host||e.sync===!1)&&sn(),this.#e=l.$$events;for(const r of Object.keys(this.#t))r==="$set"||r==="$destroy"||r==="$on"||At(this,r,{get(){return this.#t[r]},set(i){this.#t[r]=i},enumerable:!0});this.#t.$set=r=>{Object.assign(l,r)},this.#t.$destroy=()=>{_n(this.#t)}}$set(e){this.#t.$set(e)}$on(e,n){this.#e[e]=this.#e[e]||[];const s=(...l)=>n.call(this,...l);return this.#e[e].push(s),()=>{this.#e[e]=this.#e[e].filter(l=>l!==s)}}$destroy(){this.#t.$destroy()}}let hn=null;function Fn(t){hn=t}function On(t){}function pn(t){const e=vn(t),n=(s,{context:l}={})=>{const r=de(t,{props:s,context:l});return{css:{code:"",map:null},head:r.head,html:r.body}};return e.render=n,e}let gn=!1;function Dn(){}function An(){gn=!0}function mn(t,e){he();let{stores:n,page:s,constructors:l,components:r=[],form:i,data_0:f=null,data_1:a=null}=e;pe("__svelte__",n),n.page.set(s);const u=l[1];if(l[1]){t.out+="<!--[-->";const _=l[0];t.out+="<!---->",_(t,{data:f,form:i,children:o=>{o.out+="<!---->",u(o,{data:a,form:i}),o.out+="<!---->"},$$slots:{default:!0}}),t.out+="<!---->"}else{t.out+="<!--[!-->";const _=l[0];t.out+="<!---->",_(t,{data:f,form:i}),t.out+="<!---->"}t.out+="<!--]--> ",t.out+="<!--[!-->",t.out+="<!--]-->",ge()}const wn=pn(mn),In={app_template_contains_nonce:!1,csp:{mode:"auto",directives:{"upgrade-insecure-requests":!1,"block-all-mixed-content":!1},reportOnly:{"upgrade-insecure-requests":!1,"block-all-mixed-content":!1}},csrf_check_origin:!0,embedded:!1,env_public_prefix:"PUBLIC_",env_private_prefix:"",hash_routing:!1,hooks:null,preload_strategy:"modulepreload",root:wn,service_worker:!1,templates:{app:({head:t,body:e,assets:n,nonce:s,env:l})=>`<!doctype html>
<html lang="en" class="dark">
	<head>
		<meta charset="utf-8" />
		<link rel="icon" href="`+n+`/favicon.png" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<meta name="color-scheme" content="dark" />
		<title>Underleaf</title>
		`+t+`
	</head>
	<body data-sveltekit-preload-data="hover">
		<div style="display: contents">`+e+`</div>
	</body>
</html>`,error:({status:t,message:e})=>`<!doctype html>
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
`},version_hash:"198cv96"};async function Pn(){return{handle:void 0,handleFetch:void 0,handleError:void 0,init:void 0,reroute:void 0,transport:void 0}}export{Rt as B,ut as a,at as b,xn as c,hn as d,In as e,Nn as f,Pn as g,gn as h,Cn as i,Sn as j,Fn as k,Rn as l,Dn as m,On as n,kn as o,me as p,An as q,Tn as r,we as s};
//# sourceMappingURL=internal.js.map
