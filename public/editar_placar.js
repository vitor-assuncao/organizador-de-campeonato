document.addEventListener('DOMContentLoaded', carregarJogos);

function carregarJogos() {
    const urlParams = new URLSearchParams(window.location.search);
    const campeonatoId = urlParams.get('campeonatoId');

    // Fetch para listar os jogos do campeonato
    fetch(`/api/campeonatos/${campeonatoId}/jogos`)
        .then(response => response.json())
        .then(data => {
            const jogosContainer = document.getElementById('jogos-list');
            jogosContainer.innerHTML = '';

            if (data.jogos.length === 0) {
                jogosContainer.innerHTML = '<p>Não há jogos para este campeonato.</p>';
                return;
            }

            data.jogos.forEach(jogo => {
                const jogoElement = document.createElement('div');
                jogoElement.classList.add('jogo');

                jogoElement.innerHTML = `
                    <div class="time-nome">${jogo.time_casa_nome}</div>
                    <div class="placar-input">
                        <input type="number" id="golsCasa-${jogo.jogo_id}" value="${jogo.gols_casa || 0}">
                        <span class="time-vs">X</span>
                        <input type="number" id="golsVisitante-${jogo.jogo_id}" value="${jogo.gols_visitante || 0}">
                    </div>
                    <div class="time-nome">${jogo.time_visitante_nome}</div>
                    <button class="salvar-placar-btn" onclick="atualizarPlacar(${jogo.jogo_id})">
                        <i class="fa fa-check"></i>
                    </button>
                `;

                jogosContainer.appendChild(jogoElement);
            });
        })
        .catch(error => {
            console.error('Erro ao carregar os jogos:', error);
        });
}

function atualizarPlacar(jogoId) {
    const golsCasa = document.getElementById(`golsCasa-${jogoId}`).value;
    const golsVisitante = document.getElementById(`golsVisitante-${jogoId}`).value;

    const golsCasaInt = parseInt(golsCasa);
    const golsVisitanteInt = parseInt(golsVisitante);

    if (isNaN(golsCasaInt) || isNaN(golsVisitanteInt)) {
        alert('Por favor, insira valores válidos para os gols.');
        return;
    }

    fetch(`/api/jogos/${jogoId}/atualizar_placar`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            golsCasa: golsCasaInt,
            golsVisitante: golsVisitanteInt
        })
    })
    .then(response => response.json())
    .then(data => {
        alert(data.message);
        carregarJogos();
    })
    .catch(error => {
        console.error('Erro ao atualizar placar:', error);
        alert('Erro ao atualizar placar.');
    });
}

// Função Voltar
function voltar() {
    window.history.back();
}
