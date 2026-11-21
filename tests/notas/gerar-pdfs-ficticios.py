# Gera os PDFs fictícios dos testes (DANFE e DANFSe com dados inventados). Rodar de novo só se mudar o desenho:
#   python3 tests/notas/gerar-pdfs-ficticios.py
# Precisa do reportlab. Nenhum dado de cliente: CNPJ, chave e itens são inventados.
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4

AQUI = Path(__file__).parent
W, H = A4


def dv(chave43: str) -> str:
    soma, peso = 0, 2
    for c in reversed(chave43):
        soma += int(c) * peso
        peso = 2 if peso == 9 else peso + 1
    r = soma % 11
    return str(0 if r < 2 else 11 - r)


def escreve(c, x, y, texto, tam=6, fonte="Helvetica"):
    c.setFont(fonte, tam)
    c.drawString(x, H - y, texto)


def direita(c, x, y, texto, tam=7):
    c.setFont("Helvetica", tam)
    c.drawRightString(x, H - y, texto)


def danfe():
    base = "43" + "2611" + "11222333000181" + "55" + "001" + "000001234" + "1" + "12345678"
    chave = base + dv(base)
    c = canvas.Canvas(str(AQUI / "danfe-ficticio.pdf"), pagesize=A4)
    c.setTitle("DANFE ficticio")
    escreve(c, 20, 25, "RECEBEMOS DE DISTRIBUIDORA FICTICIA DE ALIMENTOS LTDA OS PRODUTOS CONSTANTES DA NOTA FISCAL INDICADA AO LADO")
    escreve(c, 20, 40, "DATA DE RECEBIMENTO")
    escreve(c, 480, 40, "NF-e", 8)
    escreve(c, 480, 52, "Nº 000.001.234", 8)
    escreve(c, 60, 100, "DISTRIBUIDORA FICTICIA DE ALIMENTOS LTDA", 9, "Helvetica-Bold")
    escreve(c, 60, 112, "RUA DOS EXEMPLOS, 100 - CENTRO - CIDADE - RS")
    escreve(c, 280, 90, "DANFE", 12, "Helvetica-Bold")
    escreve(c, 270, 102, "Documento Auxiliar da Nota Fiscal Eletrônica")
    escreve(c, 350, 150, "CHAVE DE ACESSO")
    escreve(c, 350, 160, " ".join(chave[i : i + 4] for i in range(0, 44, 4)), 8)
    escreve(c, 20, 190, "NATUREZA DA OPERAÇÃO")
    escreve(c, 20, 199, "VENDA DE MERCADORIA", 7)
    escreve(c, 290, 190, "CNPJ")
    escreve(c, 290, 199, "11.222.333/0001-81", 7)
    escreve(c, 20, 212, "DESTINATÁRIO/REMETENTE", 7, "Helvetica-Bold")
    escreve(c, 20, 220, "NOME/RAZÃO SOCIAL")
    escreve(c, 20, 229, "CAFETERIA EXEMPLO LTDA", 7)
    escreve(c, 380, 220, "CNPJ/CPF")
    escreve(c, 380, 229, "00.000.000/0001-91", 7)
    escreve(c, 490, 220, "DATA DA EMISSÃO")
    escreve(c, 490, 229, "14/11/2026", 7)
    escreve(c, 490, 240, "DATA SAÍDA/ENTRADA")
    escreve(c, 490, 249, "15/11/2026", 7)
    escreve(c, 20, 270, "FATURA/DUPLICATA", 7, "Helvetica-Bold")
    escreve(c, 20, 278, "NÚMERO")
    escreve(c, 60, 278, "VENCIMENTO")
    escreve(c, 130, 278, "VALOR")
    for x, (n, v, val) in zip((20, 170), (("001", "14/12/2026", "300,00"), ("002", "13/01/2027", "282,40"))):
        escreve(c, x, 288, n, 7)
        escreve(c, x + 40, 288, v, 7)
        direita(c, x + 135, 288, val)
    escreve(c, 20, 310, "CÁLCULO DO IMPOSTO", 7, "Helvetica-Bold")
    linha1 = [(20, "BASE DE CÁLCULO DO ICMS", "0,00"), (130, "VALOR DO ICMS", "0,00"), (470, "VALOR TOTAL DOS PRODUTOS", "547,40")]
    linha2 = [(20, "VALOR DO FRETE", "25,00"), (100, "VALOR DO SEGURO", "0,00"), (180, "DESCONTO", "0,00"), (260, "OUTRAS DESP. ACESSÓRIAS", "0,00"), (380, "VALOR DO IPI", "10,00"), (470, "VALOR TOTAL DA NOTA", "582,40")]
    for y, linha in ((318, linha1), (338, linha2)):
        fins = [x for x, _, _ in linha[1:]] + [W - 20]
        for (x, rot, val), fim in zip(linha, fins):
            escreve(c, x, y, rot)
            direita(c, fim - 6, y + 10, val)
    escreve(c, 20, 380, "DADOS DO PRODUTO/SERVIÇO", 7, "Helvetica-Bold")
    cab = [(20, "CÓDIGO"), (70, "DESCRIÇÃO DO PRODUTO/SERVIÇO"), (230, "NCM/SH"), (265, "CST"), (285, "CFOP"), (310, "UN"), (330, "QUANT."), (370, "V.UNIT."), (410, "V.TOTAL"), (450, "BC ICMS"), (490, "V.ICMS"), (530, "V.IPI")]
    for x, t in cab:
        escreve(c, x, 390, t, 5)
    itens = [
        (402, ["CAF-01", "CAFE TORRADO EM GRAOS ESPECIAL 1KG PACOTE", "09012100", "000", "5102", "PCT", "4,0000", "89,9000", "359,60", "0,00", "0,00", "10,00"], "TIPO EXPORTACAO"),
        (418, ["LEI-02", "LEITE INTEGRAL 1L", "04012010", "000", "5102", "CX", "12,0000", "15,6500", "187,80", "0,00", "0,00", "0,00"], "Lote: 123 Val: 01/2027"),
    ]
    for y, cols, embaixo in itens:
        for (x, _), t in zip(cab, cols):
            escreve(c, x, y, t, 6)
        escreve(c, 70, y + 7, embaixo, 6)
    escreve(c, 20, 700, "DADOS ADICIONAIS", 7, "Helvetica-Bold")
    escreve(c, 20, 708, "INFORMAÇÕES COMPLEMENTARES")
    escreve(c, 450, 708, "RESERVADO AO FISCO")
    escreve(c, 20, 720, "Pedido 9876 - nota de teste, dados ficticios", 7)
    c.save()
    return chave


def danfse():
    c = canvas.Canvas(str(AQUI / "danfse-ficticio.pdf"), pagesize=A4)
    c.setTitle("DANFSe ficticio")
    escreve(c, 270, 21, "DANFSe v2.0", 9)
    escreve(c, 234, 31, "Documento Auxiliar da NFS-e", 9)
    escreve(c, 12, 51, "CHAVE DE ACESSO DA NFS-e", 7)
    escreve(c, 12, 59, "43000001122233300018100000000000077726110000000001", 7)
    for x, rot, val in ((12, "NÚMERO DA NFS-e", "777"), (156, "COMPETÊNCIA DA NFS-e", "14/11/2026"), (301, "DATA E HORA DA EMISSÃO DA NFS-e", "14/11/2026 10:00:00")):
        escreve(c, x, 71, rot, 7)
        escreve(c, x, 79, val, 7)
    escreve(c, 12, 132, "PRESTADOR / FORNECEDOR", 7)
    escreve(c, 156, 131, "CNPJ / CPF / NIF", 6)
    escreve(c, 156, 139, "11.222.333/0001-81", 7)
    escreve(c, 12, 151, "Nome / Nome Empresarial", 6)
    escreve(c, 12, 158, "SERVICOS FICTICIOS DE LOGISTICA LTDA", 7)
    escreve(c, 12, 209, "TOMADOR / ADQUIRENTE", 7)
    escreve(c, 156, 208, "CNPJ / CPF / NIF", 6)
    escreve(c, 156, 216, "00.000.000/0001-91", 7)
    escreve(c, 12, 227, "Nome / Nome Empresarial", 6)
    escreve(c, 12, 235, "CAFETERIA EXEMPLO LTDA", 7)
    escreve(c, 12, 300, "Descrição do Serviço", 7)
    escreve(c, 12, 308, "SERVICO DE ENTREGA DE MERCADORIAS", 7)
    for x, rot, val in ((12, "VALOR TOTAL DA NFS-e", ""), (156, "VALOR DA OPERAÇÃO / SERVIÇO", "R$ 150,00")):
        escreve(c, x, 489, rot, 7)
        if val:
            escreve(c, x, 495, val, 7)
    for x, rot, val in ((12, "Total das Retenções (ISSQN / Federais)", "R$ 4,50"), (156, "VALOR LÍQUIDO DA NFS-e", "R$ 145,50"), (301, "Total do IBS/CBS", "R$ 1,00")):
        escreve(c, x, 507, rot, 6)
        escreve(c, x, 515, val, 7)
    escreve(c, 12, 527, "INFORMAÇÕES COMPLEMENTARES", 7)
    escreve(c, 12, 540, "Ref. NF 1234 pedido 9876", 7)
    c.save()


if __name__ == "__main__":
    print(danfe())
    danfse()
