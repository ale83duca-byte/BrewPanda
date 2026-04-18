# BrewPanda 🐼

## Gestionale per Birrifici — Da un Birraio per i Birrai

**BrewPanda** è un'applicazione web completa progettata specificamente per gestire tutte le operazioni quotidiane di un birrificio artigianale. A differenza dei software generici, BrewPanda nasce dall'esperienza diretta in sala cotta: è uno strumento unico in Italia, pensato da chi la birra la fa per chi la birra la deve produrre e vendere.

L'applicazione offre una gestione fluida che va dal carico delle materie prime fino alla vendita del prodotto finito, garantendo la tracciabilità totale di ogni lotto.

---

## 🚀 Caratteristiche Principali

### 🍺 Produzione e Sala Cotta
- **Foglio Cotta Digitale:** Gestione dettagliata delle ricette e dei parametri di produzione (Piatto iniziale, temperature, tempistiche).
- **Tracciabilità Materie Prime:** Scarico automatico degli ingredienti (malti, luppoli, lieviti) con vincolo obbligatorio su lotto, marca e fornitore per una precisione assoluta.
- **Gestione Fermentazione:** Monitoraggio giornaliero di densità e temperatura per ogni fermentatore.

### 📦 Magazzino e Inventario
- **Magazzino Materie Prime:** Controllo in tempo reale delle giacenze di ingredienti e materiali di consumo.
- **Magazzino Birra Confezionata:** Monitoraggio dello stock di bottiglie e fusti divisi per tipologia, formato e lotto di produzione.
- **Alert Scadenze:** Sistema integrato per segnalare lotti di materie prime o birra in prossima scadenza.

### 💰 Preventivi e Analisi Costi
- **Layout Preventivi:** Creazione rapida di preventivi per i clienti con analisi dei costi integrata.
- **Analisi Marginalità:** Calcolo automatico del costo di produzione per ettolitro e per unità confezionata (bottiglia/fusto), considerando materie prime, accise e materiali di confezionamento.

### 📊 Movimenti e Vendite
- **Registro Movimenti:** Storico completo di ogni operazione di carico, scarico e vendita.
- **Analisi Trend:** Grafici interattivi per visualizzare l'andamento della produzione e delle vendite nel tempo.

---

## 🛠 Tech Stack

- **Frontend:** React 18 con TypeScript per una gestione del codice robusta e tipizzata.
- **State Management & Persistence:** Utilizzo di **IndexedDB** tramite la libreria `idb` per garantire che i dati rimangano salvati localmente sul browser anche senza connessione internet.
- **Styling:** Tailwind CSS per un'interfaccia moderna, veloce e reattiva.
- **Grafici:** Recharts per la visualizzazione dei dati statistici.
- **Export:** Esportazione in formato Excel tramite la libreria `xlsx`.

---

## 📝 Installazione e Sviluppo

Se desideri visualizzare il progetto localmente:

1. Clona la repository: `git clone https://github.com/tuo-username/brewpanda.git`
2. Installa le dipendenze: `npm install`
3. Avvia l'ambiente di sviluppo: `npm run dev`
4. Crea la build di produzione: `npm run build`

---

## ⚠️ Copyright e Proprietà

© 2026 Alessio Duca. Tutti i diritti riservati.

Questo software è di proprietà esclusiva di **Alessio Duca**. 
Il codice sorgente è reso pubblico a scopo puramente illustrativo e di consultazione. 
**Non è concessa l'autorizzazione all'uso, alla copia, alla modifica o alla ridistribuzione del software** in alcuna forma, per scopi commerciali o privati, senza l'idoneo consenso scritto del proprietario.

---

*BrewPanda: La precisione della Panda, l'anima della Birra.*
