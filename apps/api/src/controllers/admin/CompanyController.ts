import { Request, Response } from 'express';
import { CompanyService } from '../../services/admin';
import { CreateCompanyDTO, UpdateCompanyDTO } from '@loginhub/shared';
import { DbError } from '../../types/error';

const companyService = new CompanyService();

export class CompanyController {

    static async createCompany(req: Request<{}, {}, CreateCompanyDTO>, res: Response) {
        try {
            const result = await companyService.registerCompany(req.body);
            return res.status(201).json(result);

        } catch (err: unknown) {
            const error = err as DbError;
            console.error('[CompanyController] createCompany:', error);

            if (error.code === '23505') {
                return res.status(409).json({
                    error: 'Conflito de Dados',
                    message: 'Documento ou E-mail já registrados.'
                });
            }

            return res.status(500).json({ error: 'Erro Interno' });
        }
    }

    static async getAllCompanies(req: Request, res: Response) {
        try {
            const companies = await companyService.getAllCompanies();
            return res.status(200).json(companies);
        } catch (err: unknown) {
            console.error('[CompanyController] getAllCompanies:', err);
            return res.status(500).json({ error: 'Erro Interno' });
        }
    }

    static async getById(req: Request<{ id: string }>, res: Response) {
        const { id } = req.params;

        try {
            const company = await companyService.getCompanyById(id);
            return res.status(200).json(company);
        } catch (err: unknown) {
            // Asserção de tipo para ler propriedades personalizadas do erro
            const error = err as { code?: string, message?: string };

            if (error.code === 'NOT_FOUND') {
                return res.status(404).json({ error: 'Empresa não encontrada' });
            }
            console.error('[CompanyController] getById:', err);
            return res.status(500).json({ error: 'Erro Interno' });
        }
    }

    static async toggleCompanyStatus(
        req: Request<{ id: string }, {}, { status: string }>,
        res: Response
    ) {
        const { id } = req.params;
        const { status } = req.body;

        if (!status || !['ativo', 'inativo'].includes(status)) {
            return res.status(400).json({ error: "Status deve ser 'ativo' ou 'inativo'." });
        }

        try {
            const empresa = await companyService.updateCompanyStatus(id, status as 'ativo' | 'inativo');
            return res.status(200).json({
                message: `Status atualizado para ${status}.`,
                empresa
            });
        } catch (err: unknown) {
            const error = err as { code?: string };
            if (error.code === 'NOT_FOUND') {
                return res.status(404).json({ error: 'Empresa não encontrada' });
            }
            console.error(`[CompanyController] toggleCompanyStatus:`, err);
            return res.status(500).json({ error: "Erro Interno" });
        }
    }

    static async deleteCompany(req: Request<{ id: string }>, res: Response) {
        const { id } = req.params;
        try {
            await companyService.deleteCompany(id);
            return res.status(200).json({ message: 'Empresa removida com sucesso.' });
        } catch (err: unknown) {
            const error = err as { code?: string };
            
            if (error.code === 'NOT_FOUND') {
                return res.status(404).json({ error: 'Empresa não encontrada' });
            }
            console.error('[CompanyController] deleteCompany:', err);
            return res.status(500).json({ error: 'Erro Interno' });
        }
    }

    static async updateCompany(req: Request<{ id: string }, {}, UpdateCompanyDTO>, res: Response) {
        const { id } = req.params;
        const { nome, email, documento, telefone } = req.body;

        try {
            // Chama o service com o objeto tipado corretamente
            const updatedCompany = await companyService.updateCompany(id, {
                nome,
                email,
                documento,
                telefone: telefone || undefined 
            });

            return res.status(200).json(updatedCompany);

        } catch (err: unknown) {
            const error = err as DbError;

            // Tratamento de erros lançados pelo Service
            if (error.code === 'NOT_FOUND') {
                return res.status(404).json({ message: 'Empresa não encontrada.' });
            }
            
            if (error.code === 'DUPLICATE_ENTRY' || error.code === '23505') {
                return res.status(409).json({ 
                    error: 'Conflito de Dados',
                    message: error.message || 'Documento ou E-mail já em uso.'
                });
            }

            console.error('[CompanyController] updateCompany:', error);
            return res.status(500).json({ message: 'Erro interno ao atualizar empresa.' });
        }
    }
}