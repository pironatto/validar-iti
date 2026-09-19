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
    barra.max = 100;
    document.getElementById("status").innerText = `Iniciando validação...`;

    try {
        const payload = { files: selectedFiles, outputFolder: outputFolder };
        await Neutralino.filesystem.writeFile("./.lista.json", JSON.stringify(payload));

        const cmd = `"${NL_PATH}/node/node.exe" "${NL_PATH}/validar.js"`;
        await rodarProcesso(cmd);

        document.getElementById("status").innerText = "✔ Validação concluída!";
        barra.value = 100;
    } catch (err) {
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