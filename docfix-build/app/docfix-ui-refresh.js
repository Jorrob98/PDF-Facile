/* DocFix PWA visual refresh: styling only. No document data or network. */
(()=>{'use strict';
 const stylesheet=document.createElement('link');
 stylesheet.rel='stylesheet';
 stylesheet.href='./docfix-pwa-refresh.css';
 stylesheet.id='docfix-pwa-refresh-styles';
 document.head.appendChild(stylesheet);
 document.documentElement.classList.add('docfix-pwa-refresh');
 window.DocFixPWAVisual=Object.freeze({version:'1.9.61-rc1',stylesheet:'docfix-pwa-refresh.css'});
})();
