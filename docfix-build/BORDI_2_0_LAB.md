# DOCFIX BORDI 2.0 — ramo sperimentale, NON pubblicato
Data: 23/11/2026. Base: DocFix 1.9.59.
Questo ramo NON cambia l'app installata né dichiara i ritagli verificati.

## Diagnosi
Scegliere il contorno più forte non basta: foto, barcode, MRZ, bordi decorativi e ombre producono falsi quadrilateri.
La versione pubblicata 1.9.59 ha test di build, ma non ha un benchmark completo e verificato sul precedente archivio privato di 92 foto originali.

## Architettura proposta
1. **Localizzazione per istanza**: foto con 1, 2, 3 tessere o foglio A4; numero di documenti distinto dalla classificazione fronte/retro.
2. **Proposta neurale locale**: valutare DocAligner LCNet/ONNX (implementazione browser `quadscan`, https://github.com/storrealbac/quadscan, modello ~4.5 MB, licenze MIT/Apache 2.0). NON adottare sulla fiducia: un rilevatore pensato per un singolo foglio va applicato separatamente alle ROI delle tessere multiple; cercare alternative instance-segmentation se i casi attaccati lo richiedono.
3. **Perimetro geometrico**: sulla FOTO ORIGINALE, cercare quattro lati con gradienti multi-scala, RANSAC fitting di rette, intersezioni angoli e prova indipendente contrasto interno/esterno. Evitare che MRZ, foto e scritte diventino bordo fisico.
4. **Scelta prudente**: consenso di due metodi + presenza quattro bordi + plausibilità prospettica. Se incerto non affermare successo; preservare foto completa, anteprima e quattro angoli correggibili. Mai creare pagine fantasma.
5. **Ritaglio finale singolo**: prospettiva una sola volta dall'originale, con margine esterno di protezione; nessuna doppia interpolazione o OCR per tagliare pixel.
6. **Privacy e offline**: niente upload dei documenti o del modello; pesi ONNX e runtime sono inclusi nella build Windows. Niente sorgenti/documenti reali nel repository.

## Misurazione obbligatoria prima di pubblicare
Annotare i quattro vertici fisici di ogni documento nelle 92 immagini, usando ID anonimi.
Formato JSON: `[{"id":"foto-001","quads":[[{"x":0.1,"y":0.1},{"x":0.8,"y":0.1},{"x":0.8,"y":0.7},{"x":0.1,"y":0.7}]]}]`.
Le predizioni hanno stessa struttura e `statuses:["auto"|"review"]`.
Eseguire `node qa-border-score-v2.cjs riferimento.json previsioni.json --strict`.
Il report riporta IoU, copertura della plastica, inclusione di sfondo, tessere mancanti, false rilevazioni e tagli erroneamente approvati. Questi sono CONTROLLI GEOMETRICI e non certificano leggibilità, orientamento o qualità PDF; servono verifiche in-app sulle esportazioni reali.
Obiettivi da raggiungere sul dataset reale: >=95% documenti automatici corretti, zero tagli gravi promossi automaticamente, zero pagine fantasma, zero documenti persi senza avviso. Obiettivi, NON risultati ottenuti.
I test sintetici verificano solo che il misuratore non premi una previsione geometricamente errata.
