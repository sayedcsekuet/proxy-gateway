import {Request, Response} from 'express';
import {JsonConsoleLogger} from "../logger/JsonConsoleLogger";
import {Methods} from "../models/Methods";
import {Resources} from "../models/Resources";
import {MethodsDomains, SupportedContentTypes, SupportedMethods} from "../domains/MethodsDomains";
import {InputValidationException} from "../exceptions/InputValidationException";
import {NotFoundException} from "../exceptions/NotFoundException";
import validator from "validator";
import {Sequelize} from "sequelize";

const Op = Sequelize.Op;

export class MethodsHandler {
    protected logger: JsonConsoleLogger;

    constructor(logger: JsonConsoleLogger) {
        this.logger = logger;
    }

    /**
     * get all Methods
     * @param  {Request} req
     * @param  {Response} res
     * @return {any}
     */
    public async getAll(req: Request, res: Response): Promise<any> {
        try {
            const process = await Methods.findAll({include: [Resources]});
            const response: MethodsDomains[] = [];

            process.forEach((value: any) => {
                const aux = new MethodsDomains(
                    value.resourcesId,
                    value.id,
                    value.method,
                    value.authType,
                    value.contentType,
                    value.denyUpload,
                    value.limit,
                    value.integrationType,
                    value.forwardedMethod,
                    value.endpointUrl,
                    value.endpointProtocol,
                    value.contentHandling,
                    value.timeout,
                    value.mockResponseBody,
                    value.mockResponseCode,
                    value.mockResponseContent,
                    value.active
                );
                response.push(aux);
            });
            res.send(response);

            this.logger.log({managing_route: req.url, payload: req.body, response, tag: "manager"});
        } catch (e) {
            this.logger.logError({message: e, tag: "manager"});
            res.status(500).send({error: e.message});
        }
    }

    /**
     * delete a method
     * @param  {Request} req
     * @param  {Response} res
     * @param  {string} id uuid v4 format
     * @return {any}
     */
    public async deleteOne(req: Request, res: Response, id: string): Promise<any> {
        try {
            if (!validator.isUUID(id)) {
                throw new InputValidationException('Invalid ID: ' + req.url);
            }
            Methods.destroy({where: {id}});
            const response = {delete: true};
            res.send(response);
            this.logger.log({managing_route: req.url, payload: req.body, response, tag: "manager"});
        } catch (e) {
            if (e instanceof InputValidationException) {
                res.status(409).send({error: e.message});
            } else {
                res.status(500).send({error: e.message});
            }
            this.logger.logError({message: e, tag: "manager"});
        }
    }

    /**
     * add/update method
     * @param  {Request} req
     * @param  {Response} res
     * @return {any}
     */
    public async addOrUpdate(req: Request, res: Response): Promise<any> {
        try {
            const apiData = req.body;

            if (!validator.isUUID(apiData.resourcesId)) {
                throw new InputValidationException('Invalid resource ID: ' + req.url);
            }

            if (!(await this.existResource(apiData.resourcesId))) {
                throw new NotFoundException('Resource not found: ' + req.url);
            }

            apiData.method = (apiData.method !== undefined) ? apiData.method : SupportedMethods.get;

            if (!apiData.hasOwnProperty("id")) {
                if (!(await this.uniqueMethod(apiData.method, apiData.resourcesId))) {
                    throw new InputValidationException('Method already exists for current resource');
                }
                const uuid = require('uuid-v4');
                apiData.id = uuid();
            }

            // todo: have a check of duplicate when an existing created method so won't take place of another existing

            if (apiData.integrationType === 'MOCK') {
                if (!validator.isJSON(apiData.mockResponseBody)) {
                    throw new InputValidationException('Invalid JSON mocked response');
                }
                apiData.mockResponseBody = (apiData.mockResponseBody !== '') ? apiData.mockResponseBody : '{}';
                apiData.mockResponseCode = (apiData.mockResponseCode !== '') ? apiData.mockResponseCode : 200;
                apiData.mockResponseContent = (apiData.mockResponseContent !== '') ?
                    apiData.mockResponseContent : SupportedContentTypes.json;
            }

            if ((apiData.endpointUrl !== '') || (apiData.integrationType === 'HTTP')) {
                if (!validator.isURL(apiData.endpointUrl)) {
                    throw new InputValidationException('Invalid endpoint URL ' + req.url);
                }
            }

            await Methods.upsert(
                new MethodsDomains(
                    apiData.resourcesId,
                    apiData.id,
                    apiData.method,
                    apiData.authType,
                    apiData.contentType,
                    apiData.denyUpload,
                    apiData.limit,
                    apiData.integrationType,
                    apiData.forwardedMethod,
                    apiData.endpointUrl,
                    apiData.endpointProtocol,
                    apiData.contentHandling,
                    apiData.timeout,
                    apiData.mockResponseBody,
                    apiData.mockResponseCode,
                    apiData.mockResponseContent,
                    apiData.active,
                )
            );
            const response = await Methods.findByPk(apiData.id);
            if (response === null) {
                throw new NotFoundException("An error occurred. Method not found");
            } else {
                res.send(response);
                this.logger.log({managing_route: req.url, payload: req.body, response, tag: "manager"});
            }
        } catch (e) {
            if (e instanceof InputValidationException) {
                res.status(409).send({error: e.message});
            } else if (e instanceof NotFoundException) {
                res.status(404).send({error: e.message});
            } else {
                res.status(500).send({error: e.message});
            }
            this.logger.logError({message: e, tag: "manager"});
        }
    }

    /**
     * get method by ID
     * @param  {Request} req
     * @param  {Response} res
     * @param  {string} id  uuid v4 format
     * @return {any}
     */
    public async getById(req: Request, res: Response, id: string): Promise<any> {
        try {
            if (!validator.isUUID(id)) {
                throw new InputValidationException('Invalid ID: ' + req.url);
            }
            const response = await Methods.findByPk(id, {include: [Resources]});
            if (response !== null) {
                res.send(response);
                this.logger.log({managing_route: req.url, payload: req.body, response, tag: "manager"});
            } else {
                throw new NotFoundException("Method not found");
            }
        } catch (e) {
            if (e instanceof InputValidationException) {
                res.status(409).send({error: e.message});
            } else if (e instanceof NotFoundException) {
                res.status(404).send({error: e.message});
            } else {
                res.status(500).send({error: e.message});
            }
            this.logger.logError({message: e, tag: "manager"});
        }
    }

    /**
     * Check if a resource exists
     * @access  private
     * @param  {string} resourceId
     * @return {boolean}
     */
    private async existResource(resourceId: string): Promise<boolean> {
        const counter = await Resources.count({where: {'id': resourceId}});
        return (counter !== 0);
    }

    /**
     * Check if a method already exists for current resource id
     * @access  private
     * @param  {string} method
     * @param  {string} resourcesId
     * @return {boolean}
     */
    private async uniqueMethod(method: string, resourcesId: string): Promise<boolean> {
        const counter = await Methods.count(
            {
                where: {
                    [Op.and]: [
                        {'method': method},
                        {'resourcesId': resourcesId}
                    ]
                }
            }
        );
        return (counter === 0);
    }
}
