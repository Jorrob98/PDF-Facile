# DocFix Desktop — Audit di stabilità (6 novembre 2026)

## Obiettivo
Proteggere il flusso già collaudato (foto singola, gruppi 2×2, gruppi 3×2,
anteprime, correzione manuale, OCR e PDF) da errori silenziosi e regressioni.
Non aggiungere nuovi algoritmi di ritaglio durante questo audit.

## Difetti verificati e corretti nel ramo `docfix-desktop-build`
1. **Azzeramento involontario dell'immagine originale.**
   `DocFixScanner.resize()` restituisce l'originale se già piccolo.
   Alcune funzioni liberavano il presunto canvas temporaneo usando
   `width=height=1`, distruggendo l'immagine. Corretti
   `estimateFineDeskew()`, `multiCropHealthy()`,
   `DocFixPhysicalEdges.detect()` con controllo di identità.
2. **Controllo qualità fail-open.**
   `multiCropHealthy()` restituiva `true` quando l'analisi lanciava
   un'eccezione. Ora restituisce `false`: un'analisi fallita non equivale
   a una verifica superata.
3. **L'ordinamento manuale poteva essere annullato all'esportazione.**
   `regroupSixCards()` veniva richiamato anche dopo `Prima/Dopo` o un
   trascinamento. Introdotto `manuallyOrdered`, resettato solo alla nuova
   pratica. L'ordine impostato dall'operatore prevale sul riordino automatico.
4. **Conferma di orientamento non realmente eseguita.**
   Per tutte le foto con tre tessere il codice assegnava
   `trustworthy:true` a una rotazione geometrica di 90°. Eliminata
   la falsa conferma. La carta d'identità verifica la disposizione MRZ
   prima di correggere ulteriori rotazioni.
5. **Conflitti fra due prove di fronte/retro.**
   Se etichette e differenza della banda nera della tessera sanitaria
   si contraddicono fortemente, il riordino ora richiede controllo
   anziché imporsi silenziosamente.

## Test automatici introdotti
`node qa-stability-guard.cjs` deve terminare senza errori.
La pipeline Windows lo esegue prima della creazione dell'installer.
Il test funzionale Electron verifica inoltre che analisi su un canvas
di 310×190 pixel non cambino dimensioni o pixel dell'originale.
Casi coperti: ordine 4/4; 6/6; manuale invariato; etichette discordanti;
riconoscimento incerto; errori controllo qualità; produzione PDF con /Count 6;
rifiuto di canvas vuoti. Nessuna foto cliente nei test.

## Rischi residui da collaudare su Windows reale
- La scelta fra 2 e 3 tessere per foto favorisce il rilevatore 2×2
  quando quest'ultimo restituisce due tessere con alta confidenza.
  Non è stato cambiato durante l'audit per non regredire il 2×2 già funzionante.
  Servono prove con foto dove il terzo documento è molto tenue.
- Il processo di aggiornamento Windows controlla download e lancio del
  programma di aggiornamento, ma il lancio da solo non prova l'installazione
  avvenuta. Verificare versione visualizzata dopo riavvio.
- Le nuove protezioni vengono testate con immagini sintetiche. Il test
  finale sui documenti reali deve essere effettuato prima di dichiarare
  la funzionalità definitivamente collaudata.

## Criteri di rilascio
- Nessuna regressione nei PDF 2×2 e nei documenti singoli.
- Due fotografie con tre tessere: sei anteprime e sei pagine, senza tagli.
- Ordine manuale rispettato dopo PDF.
- Non perdere immagini originali di qualunque dimensione.
- Fallimento esplicito se l'algoritmo non verifica bordo, verso o qualità.
- Test `qa-stability-guard.cjs` e `--self-test` Electron entrambi superati.
