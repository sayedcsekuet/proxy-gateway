import {Request, Response} from 'express';
import {JsonConsoleLogger} from "../logger/JsonConsoleLogger";
import {Resources} from "../models/Resources";
import {Methods} from "../models/Methods";
import {ResourcesDomain} from "../domains/ResourcesDomain";
import {InputValidationException} from "../exceptions/InputValidationException";
import {Namespaces} from "../models/Namespaces";
import {NotFoundException} from "../exceptions/NotFoundException";
import validator from 'validator';
import {Sequelize} from "sequelize";

const Op = Sequelize.Op;

export class ResourcesHandler {
    protected logger: JsonConsoleLogger;

    constructor(logger: JsonConsoleLogger) {
        this.logger = logger;
    }

    /**
     * get all resources
     * @param  {Request} req
     * @param  {Response} res
     * @return {any}
     */
    public async getAll(req: Request, res: Response): Promise<any> {
        try {
            const process = await Resources.findAll({include: [Methods]});
            const response: ResourcesDomain[] = [];

            process.forEach((value: any) => {
                const aux = new ResourcesDomain(
                    value.namespacesId,
                    value.id,
                    value.resourcesId,
                    value.path,
                    value.methods,
                    value.childResources
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
     * delete a resource
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
            Resources.destroy({where: {id}});
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
     * add/update resource
     * @param  {Request} req
     * @param  {Response} res
     * @return {any}
     */
    public async addOrUpdate(req: Request, res: Response): Promise<any> {
        try {
            const apiData = req.body;
            apiData.path = validator.whitelist(apiData.path, 'a-zA-Z0-9-_');
            if (!validator.isUUID(apiData.namespacesId)) {
                throw new InputValidationException('Invalid namespace ID: ' + req.url);
            }
            if (!(await this.existNamespace(apiData.namespacesId))) {
                throw new NotFoundException('Namespace not found: ' + req.url);
            }
            if (!apiData.hasOwnProperty("id")) {
                if (!(await this.uniqueResource(apiData.path, apiData.namespacesId, apiData.resourcesId))) {
                    throw new InputValidationException('Resource already exists for current namespace');
                }
                const uuid = require('uuid-v4');
                apiData.id = uuid();
            }

            if (validator.isEmpty(apiData.path)) {
                throw new InputValidationException('Invalid resource');
            }

            await Resources.upsert(
                new ResourcesDomain(
                    apiData.namespacesId,
                    apiData.id,
                    apiData.resourcesId,
                    apiData.path
                ));
            const response = await Resources.findByPk(apiData.id);
            if (response === null) {
                throw new NotFoundException("Resource not found");
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
     * get resource by ID
     * @param  {Request} req
     * @param  {Response} res
     * @param id
     * @return {any}
     */
    public async getById(req: Request, res: Response, id: string): Promise<any> {
        try {
            if (!validator.isUUID(id)) {
                throw new InputValidationException('Invalid ID: ' + req.url);
            }
            const item = await Resources.findByPk(id, {
                include: [Resources, Methods]
            });

            if (item !== null) {
                const response = new ResourcesDomain(
                    item.namespacesId,
                    item.id,
                    item.resourcesId,
                    item.path,
                    item.methods,
                    item.childResources
                );
                res.send(response);

                this.logger.log({managing_route: req.url, payload: req.body, response, tag: "manager"});
            } else {
                throw new NotFoundException("Resource not found");
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
     * get tree of resources by namespace ID
     * @param  {Request} req
     * @param  {Response} res
     * @param id
     * @return {any}
     */
    public async getTreeByNamespace(req: Request, res: Response, id: string): Promise<any> {
        try {
            if (!validator.isUUID(id)) {
                throw new InputValidationException('Invalid ID: ' + req.url);
            }
            const allResources: Resources[] = await Resources.findAll({
                where: {namespacesId: id},
                include: [Methods]
            });

            const container: ResourcesDomain[] = [];

            allResources.forEach((element: Resources) => {
                container.push(new ResourcesDomain(
                    element.namespacesId,
                    element.id,
                    element.resourcesId,
                    element.path,
                    element.methods,
                    [],
                ));
            });

            const response = this.list_to_tree(container);
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
     * get methods under a resource ID
     * @param  {Request} req
     * @param  {Response} res
     * @param id
     * @return {any}
     */
    public async getByIdMethods(req: Request, res: Response, id: string): Promise<any> {
        try {
            if (!validator.isUUID(id)) {
                throw new InputValidationException('Invalid ID: ' + req.url);
            }
            const response = await Resources.findByPk(id, {
                include: [Methods]
            });

            if (response !== null) {
                res.send(response);
                this.logger.log({managing_route: req.url, payload: req.body, response, tag: "manager"});
            } else {
                throw new NotFoundException("Resource not found");
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

    private list_to_tree(list: ResourcesDomain[]) {
        const map: any = {};
        let i;
        let node;
        const roots = [];
        for (i = 0; i < list.length; i += 1) {
            map[list[i].id] = i; // initialize the map
        }

        for (i = 0; i < list.length; i += 1) {
            node = list[i];
            if (node.resourcesId !== null) {
                list[map[node.resourcesId]].childResources!.push(node);

            } else {
                roots.push(node);
            }
        }
        return roots;
    }

    private async uniqueResource(path: string, namespacesId: string, resourcesId: string): Promise<boolean> {
        const counter = await Resources.count(
            {
                where: {
                    [Op.and]: [
                        {'path': path},
                        {'namespacesId': namespacesId},
                        {'resourcesId': resourcesId}
                    ]
                }
            }
        );
        return (counter === 0);
    }

    private async existNamespace(namespacesId: string): Promise<boolean> {
        const counter = await Namespaces.count({where: {'id': namespacesId}});
        return (counter !== 0);
    }
}
