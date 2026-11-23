# DocFix 1.9.65 — Collaudo bordi e PDF (23 novembre 2026)

## Verifica sulle due fotografie originali fornite
- **2 JPEG**, uno per lato della stessa carta, 1200 × 1600 pixel ciascuno.
- Controllo indipendente con maschera colore, componenti connessi e rettangolo orientato sulla foto sorgente.
- Contorni materiali stimati: circa 1101 × 696 pixel e 1008 × 636 pixel; proporzioni vicine a 1,58.
- Per ciascuna foto, **24 campioni su 24** lungo le estremità dei quattro bordi distinguono correttamente plastica e sfondo. Si tratta di un confronto indipendente, NON dell'esportazione 1.9.65 sul PC dell'utente.
- Le due originali **non sono state aggiunte al repository** e i dati anagrafici non sono stati copiati nei test.

## Problema reale scoperto dai test di regressione
In 1.9.64, quando un angolo della tessera era coperto, i tratti centrali dei quattro lati potevano ancora produrre un rettangolo geometrico convincente. Il vecchio motore poteva approvare il ritaglio perché non controllava abbastanza vicino agli angoli.

**Correzione 1.9.65:** prima dell'approvazione automatica si richiedono evidenze della plastica in entrambe le estremità di ciascuno dei quattro lati (otto brevi bracci, tre campioni per braccio). Se un'estremità non è riconoscibile, la proposta può comparire, ma resta **da verificare**. Rimane obbligatorio anche l'audit indipendente sui quattro lati.

## Matrice ripetibile (test sintetici)
- Tessera integra: rilevamento coerente, quattro angoli misurati.
- Angolo superiore sinistro oscurato: **non** può essere approvato automaticamente.
- Angolo inferiore destro oscurato: **non** può essere approvato automaticamente.
- Ombra pronunciata su un lato: verifica manuale.
- Sfondo bianco e sfondo di colore simile alla tessera senza separazione cromatica: nessuna approvazione non fondata.
- Una tessera per foto: nessuna pagina fantasma.
- Due tessere affiancate o sovrapposte nello stesso scatto: il controllo per tessera singola non deve dichiarare un solo documento.
- PDF con due pagine: struttura corretta, immagini JPEG incorporate preservate byte per byte, proporzioni e orientamento conservati.
- JPEG corrotto: rifiuto esplicito anziché file PDF apparentemente riuscito.
- Regressioni sul download PDF e sul riconoscimento originale: conservate.

Eseguibili: `qa-edge-corner-165.cjs`, `qa-pdf-image-integrity-165.cjs`, `qa-wood-four-physical-164.cjs`, `qa-single-wood-163.cjs`, `qa-safe-pdf-163.cjs`.

## Limiti del collaudo
- **Non** sono state provate nell'app 1.9.65 nuove foto reali di patente, tessera sanitaria, A4, sfondi chiari o fortemente inclinati. I test sintetici non sostituiscono queste verifiche.
- Il PDF utente disponibile della sessione è il **vecchio collaudo a 3 pagine**: non prova la qualità del PDF definitivo prodotto dalla 1.9.64 o 1.9.65.
- Senza il PDF definitivo esportato dalla 1.9.65 non è possibile certificare sul PC dell'utente l'esatta risoluzione e assenza di ritagli dei documenti finali.
- L'obiettivo non è massimizzare le conferme automatiche a costo di tagli errati. Un caso dubbio deve tornare alla correzione manuale.

## Esito
**PASS** regressioni automatiche e controllo indipendente sulle due foto reali. **DA COLLAUDARE** generalizzazione a documenti e sfondi reali diversi e PDF finale Windows.
