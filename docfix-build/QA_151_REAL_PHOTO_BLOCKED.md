# DocFix — blocco rilascio 1.9.51 (18/11/2026)

Questo ramo NON deve essere distribuito come aggiornamento stabile.

## Problema
Il ritaglio automatico rimane approssimativo su alcune fotografie reali di CIE
quando il bordo della plastica e poco contrastato o la prospettiva e ampia.
Un contorno di colore/texture non dimostra i quattro lati del documento.

## Lavoro eseguito
- Nuovo modulo di consenso source-first: tre tentativi geometrici intorno a
  un candidato, accettazione solo con due risultati di quattro lati concordi;
  mai certificazione PDF senza revisione.
- Le funzioni precedenti, OCR e PDF non sono cambiate.
- Collaudo CI: 70/70 controlli Electron, test sintetico positivo, controlli
  negativi di geometria instabile positivi:
  https://github.com/Jorrob98/PDF-Facile/actions/runs/44340185553

## Verifica FONDAMENTALE sui file fotografici REALI (locale, senza GitHub)
Sono state ispezionate quattro fotografie originali del 09/11 e del 16/11.
Usando un prototipo di aggancio bordi equivalente, con punti iniziali
approssimativi:
- Sfondo chiaro, retro: linee laterali troppo deboli per il consenso.
- Sfondo chiaro, fronte: rapporto apparente variabile per prospettiva,
  rigettato dalle attuali soglie di forma.
- Piano/scanner, retro: due lati con bassa evidenza, rifiutati.
- Piano/scanner, fronte: bordo alto e destro non sufficientemente attendibili.

**Esito: 0/4 casi reali con rifinitura autonoma pienamente confermata.**
Il prototipo locale non e la build finale; il dato NON e un test
end-to-end del programma Windows. Serve come controprova delle false
assicurazioni date dai soli test sintetici.

## Criteri prima del prossimo rilascio
1. Contorni reali dei quattro documenti annotati in coordinate pixel
   (ground truth), senza versionare foto o dati personali.
2. Test automatico confrontabile: errore per ciascuno dei quattro
   angoli, margine massimo esterno, conservazione MRZ, volto e barcode.
3. Validare separatamente foto singole CIE, coppie, tessera sanitaria,
   patente e CF su sfondi chiari/scuri, ombre, prospettiva.
4. Se la confidenza e bassa, lasciare l'originale e indicare con
   precisione quale bordo e mancante; non chiamare il crop 'preciso'.
5. Nessuna regressione sulle pagine PDF e documenti A4.
6. Prova effettiva della build Windows, non solo di funzioni isolate.

## Direzione tecnica
Serve un vero passo di segmentazione/contorno fisico (OpenCV/WASM
o modello document-edge), con ottimizzazione globale dei quattro lati
e validazione sulla fotografia originale; un altro sistema di soglie
RGB non e sufficiente. Conservare le conferme manuali come fallback.
