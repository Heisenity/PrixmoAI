import{r as p}from"./react-vendor-BShjbBE1.js";import{u as T,b as d,j as S,k as U}from"./index-SXra1ka_.js";const k=t=>new Promise((i,m)=>{const l=new FileReader;l.onload=()=>{if(typeof l.result=="string"){i(l.result);return}m(new Error("Failed to read image file"))},l.onerror=()=>{m(new Error("Failed to read image file"))},l.readAsDataURL(t)}),O="prixmoai:meta-oauth",A=560,F=760,x=t=>{if(!t||typeof t!="object")return!1;const i=t;return!(i.status!=="success"&&i.status!=="error"&&i.status!=="select_facebook_pages"||typeof i.message!="string"||i.status==="select_facebook_pages"&&typeof i.selectionId!="string")},_=t=>{try{t.document.write(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Connecting to PrixmoAI</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #0b1018;
        color: #f5f7fb;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .panel {
        width: min(360px, calc(100vw - 40px));
        padding: 28px 24px;
        border-radius: 24px;
        background: rgba(18, 24, 36, 0.94);
        border: 1px solid rgba(255, 255, 255, 0.08);
        box-shadow: 0 24px 70px rgba(0, 0, 0, 0.35);
        text-align: center;
      }
      h1 {
        margin: 0 0 12px;
        font-size: 22px;
      }
      p {
        margin: 0;
        line-height: 1.6;
        color: rgba(232, 237, 248, 0.78);
      }
    </style>
  </head>
  <body>
    <div class="panel">
      <h1>Opening Meta login…</h1>
      <p>PrixmoAI is preparing the secure connection window.</p>
    </div>
  </body>
</html>`),t.document.close()}catch{}},v=()=>{const t=window.screenX+Math.max(0,(window.outerWidth-A)/2),i=window.screenY+Math.max(0,(window.outerHeight-F)/2),m=[`width=${A}`,`height=${F}`,`left=${Math.round(t)}`,`top=${Math.round(i)}`,"popup=yes","resizable=yes","scrollbars=yes"].join(","),l=window.open("","prixmoai-meta-oauth",m);return l&&_(l),l},H=async(t,i,m)=>(t.location.replace(i),t.focus(),await new Promise((l,b)=>{let E=!1;const y=u=>{if(!E){E=!0,window.removeEventListener("message",P),window.clearInterval(c),window.clearTimeout(M);try{t.closed||t.close()}catch{}u()}},P=u=>{if(u.origin!==m)return;const g=u.data&&typeof u.data=="object"?u.data:null;if((g==null?void 0:g.type)!==O)return;const r=x(g.result)?g.result:x(g)?g:null;r&&y(()=>{l(r)})},c=window.setInterval(()=>{t.closed&&y(()=>{b(new Error("The Meta login window was closed before the connection finished."))})},400),M=window.setTimeout(()=>{y(()=>{b(new Error("Meta login took too long. Please try connecting again."))})},5*6e4);window.addEventListener("message",P)})),N=()=>{const{token:t}=T(),[i,m]=p.useState(null),[l,b]=p.useState(null),[E,y]=p.useState(!1),[P,c]=p.useState(!1),[M,u]=p.useState(!1),[g,r]=p.useState(null),f=async()=>{if(t){y(!0);try{const[e,a]=await Promise.all([d("/api/scheduler/accounts",{token:t}),d("/api/scheduler/posts",{token:t})]);m(e),b(a),r(null)}catch(e){r(e instanceof Error?e.message:"Failed to load scheduler")}finally{y(!1)}}};return p.useEffect(()=>{f()},[t]),p.useEffect(()=>{if(!t)return;const e=window.setInterval(()=>{f()},3e4);return()=>{window.clearInterval(e)}},[t]),{accounts:i,posts:l,isLoading:E,isMutating:P,isUploadingMedia:M,isBusy:E||P||M,error:g,refresh:f,createAccount:async e=>{var a,o;if(!t)throw new Error("Sign in again to connect accounts.");r(null),c(!0);try{const s={platform:e.platform,...(a=e.accountId)!=null&&a.trim()?{accountId:e.accountId.trim()}:{},...(o=e.profileUrl)!=null&&o.trim()?{profileUrl:e.profileUrl.trim()}:{},...e.metadata?{metadata:e.metadata}:{}},n=await d("/api/scheduler/accounts",{method:"POST",token:t,body:s});return await f(),n}catch(s){const n=s instanceof Error?s.message:"Failed to connect social account",w=U(n),h=(w==null?void 0:w.message)??n;throw w&&S(w),r(h),new Error(h)}finally{c(!1)}},startMetaOAuth:async e=>{var o,s;if(!t)throw new Error("Sign in again to verify Meta accounts.");r(null),c(!0);const a=v();try{const n=await d("/api/scheduler/oauth/meta/start",{method:"POST",token:t,body:{platform:e.platform,...(o=e.accountId)!=null&&o.trim()?{accountId:e.accountId.trim()}:{},...(s=e.profileUrl)!=null&&s.trim()?{profileUrl:e.profileUrl.trim()}:{}}});return a?await H(a,n.authUrl,n.popupOrigin):(window.location.assign(n.authUrl),null)}catch(n){a&&!a.closed&&a.close();const w=n instanceof Error?n.message:"Failed to start Meta verification",h=U(w),I=(h==null?void 0:h.message)??w;throw h&&S(h),r(I),new Error(I)}finally{c(!1)}},loadPendingMetaFacebookPages:async e=>{if(!t)throw new Error("Sign in again to continue connecting Facebook Pages.");r(null);try{return await d(`/api/scheduler/oauth/meta/pending/facebook-pages/${e}`,{token:t})}catch(a){const o=a instanceof Error?a.message:"Failed to load Facebook Pages";throw r(o),new Error(o)}},finalizePendingMetaFacebookPages:async(e,a)=>{if(!t)throw new Error("Sign in again to connect Facebook Pages.");r(null),c(!0);try{const o=await d("/api/scheduler/oauth/meta/finalize/facebook-pages",{method:"POST",token:t,body:{selectionId:e,pageIds:a}});return await f(),o}catch(o){const s=o instanceof Error?o.message:"Failed to connect the selected Facebook Pages";throw r(s),new Error(s)}finally{c(!1)}},createPost:async e=>{var a,o;if(!t)throw new Error("Sign in again to schedule posts.");r(null),c(!0);try{const s={socialAccountId:e.socialAccountId,...e.contentId?{contentId:e.contentId}:{},...e.generatedImageId?{generatedImageId:e.generatedImageId}:{},...e.platform?{platform:e.platform}:{},...(a=e.caption)!=null&&a.trim()?{caption:e.caption.trim()}:{},...(o=e.mediaUrl)!=null&&o.trim()?{mediaUrl:e.mediaUrl.trim()}:{},scheduledFor:e.scheduledFor,...e.status?{status:e.status}:{}},n=await d("/api/scheduler/posts",{method:"POST",token:t,body:s});return await f(),n}catch(s){const n=s instanceof Error?s.message:"Failed to create scheduled post";throw r(n),new Error(n)}finally{c(!1)}},updateStatus:async(e,a)=>{if(!t)throw new Error("Sign in again to update post status.");r(null),c(!0);try{await d(`/api/scheduler/posts/${e}/status`,{method:"PATCH",token:t,body:{status:a}}),await f()}catch(o){const s=o instanceof Error?o.message:"Failed to update post status";throw r(s),new Error(s)}finally{c(!1)}},disconnectAccount:async e=>{if(!t)throw new Error("Sign in again to manage connected accounts.");r(null),c(!0);try{await d(`/api/scheduler/accounts/${e}`,{method:"DELETE",token:t}),await f()}catch(a){const o=a instanceof Error?a.message:"Failed to disconnect social account";throw r(o),new Error(o)}finally{c(!1)}},uploadPostMedia:async e=>{if(!t)throw new Error("Sign in again to upload post media.");if(!["image/jpeg","image/png","image/webp"].includes(e.type))throw new Error("Only JPG, PNG, and WEBP images are supported.");if(e.size>6*1024*1024)throw new Error("Uploaded image must be 6MB or smaller.");r(null),u(!0);try{const a=await k(e);return await d("/api/images/upload-source",{method:"POST",token:t,body:{fileName:e.name,contentType:e.type,dataUrl:a}})}catch(a){const o=a instanceof Error?a.message:"Failed to upload post media";throw r(o),new Error(o)}finally{u(!1)}}}};export{N as u};
