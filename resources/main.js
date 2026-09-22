Neutralino.init();

let selectedFiles = [];
let outputFolder = "";
let barra = document.getElementById("barra");

async function chooseDocs() {
    try {
        const result = await Neutralino.os.showOpenDialog("Selecione documentos", {
            filters: [{ name: "Documentos", extensions: ["pdf", "p7s", "xml"] }],
            multiSelections: true
        });
        if (result && result.length > 0) {
            selectedFiles = result;
            document.getElementById("status").innerText = `Selecionados ${selectedFiles.length} arquivos.`;
            document.getElementById("iniciar").disabled = !outputFolder;
        }
    } catch (err) {
        document.getElementById("status").innerText = "Erro ao abrir diálogo: " + err.message;
    }
}

async function chooseOutput() {
    try {
        const result = await Neutralino.os.showFolderDialog("Escolha a pasta de saída");
        if (result) {
            outputFolder = result;
            document.getElementById("status").innerText = `Saída definida: ${outputFolder}`;
            document.getElementById("iniciar").disabled = selectedFiles.length === 0;
        }
    } catch (err) {
        document.getElementById("status").innerText = "Erro ao abrir diálogo: " + err.message;
    }
}

function rodarProcesso(cmd) {
    return new Promise(async (resolve, reject) => {
        try {
            let proc = await Neutralino.os.spawnProcess(cmd);
            let onProcessEvent = (evt) => {
                if (evt.detail.id === proc.id) {
                    if (evt.detail.action === 'exit') {
                        Neutralino.events.off('spawnedProcess', onProcessEvent);
                        resolve(evt.detail);
                    }
                }
            };
            Neutralino.events.on('spawnedProcess', onProcessEvent);
        } catch (error) {
            reject(error);
        }
    });
}

async function startValidation() {
    if (selectedFiles.length === 0 || !outputFolder) {
        document.getElementById("status").innerText = "Selecione arquivos e pasta de saída primeiro.";
        return;
    }

    document.getElementById("iniciar").disabled = true;
    document.getElementById("abrirEntrada").disabled = true;
    document.getElementById("abrirSaida").disabled = true;

    barra.classList.remove("indeterminate");
    barra.value = 0;
    barra.max = selectedFiles.length;
    document.getElementById("status").innerText = `Iniciando validação (0/${selectedFiles.length})...`;

    // Intervalo para verificar o progresso em tempo real
    let timerProgresso = setInterval(async () => {
        try {
            let progressoTxt = await Neutralino.filesystem.readFile("./.progresso.txt");
            if (progressoTxt) {
                let partes = progressoTxt.trim().split("/");
                let atual = parseInt(partes[0]);
                let total = parseInt(partes[1]);

                barra.value = atual;
                document.getElementById("status").innerText = `Validando arquivos... (${atual}/${total})`;
            }
        } catch (e) { }
    }, 400); // Atualiza a cada 400ms

    try {
        const payload = { files: selectedFiles, outputFolder: outputFolder, processados: 0, total: selectedFiles.length };
        await Neutralino.filesystem.writeFile("./.lista.json", JSON.stringify(payload));

        const cmd = `"${NL_PATH}/node/node.exe" "${NL_PATH}/validar.js"`;
        await rodarProcesso(cmd);

        clearInterval(timerProgresso);
        barra.value = selectedFiles.length;
        document.getElementById("status").innerText = "✔ Validação concluída com sucesso!";
    } catch (err) {
        clearInterval(timerProgresso);
        console.error("Erro:", err);
        document.getElementById("status").innerText = "Erro durante a validação.";
    } finally {
        document.getElementById("iniciar").disabled = false;
        document.getElementById("abrirEntrada").disabled = false;
        document.getElementById("abrirSaida").disabled = false;
    }
}

document.getElementById("abrirEntrada").addEventListener("click", chooseDocs);
document.getElementById("abrirSaida").addEventListener("click", chooseOutput);
document.getElementById("iniciar").addEventListener("click", startValidation);

async function mostrarAjuda() {
    try {
        await Neutralino.os.showMessageBox(
            "Instruções",
            "1. Selecione a pasta de Entrada.\n" +
            "2. Selecione os documentos (PDF, P7S, XML).\n" +
            "3. Escolha a pasta de saída.\n" +
            "4. Clique em Iniciar Validação para processar.\n" +
            "\n" +
            "Os documentos terão os nomes alterados para: \n" +
                    "_ERRO.pdf : Documentos com assinatura indeterminada.\n"+
                    "_FALHA.txt : Documentos que não tem assinatura.\n" +
                    "_relatorio.pdf : Documentos validados"

        );
    } catch (err) {
        // Fallback caso o Neutralino dê qualquer outro problema: usa o alert nativo
        alert(
            "Ajuda - Validador\n\n" +
            "1. Selecione os documentos (PDF, P7S, XML).\n" +
            "2. Escolha a pasta de saída.\n" +
            "3. Clique em Iniciar Validação para processar."
        );
    }
}

document.getElementById("btnAjuda").addEventListener("click", mostrarAjuda);