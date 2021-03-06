import {Request, Response} from 'express';
import {HttpResponseCodes} from "../const/HttpResponseCodes";
import {JsonConsoleLogger} from "../logger/JsonConsoleLogger";

class GlobalErrorsMiddleware {

    public static toCallable(logger: JsonConsoleLogger) {
        return (error: any, req: Request, res: Response, next: any) => {
            if (error) {
                logger.logError({stack: error, message: 'Global error caught', tag: 'security'});
                res.sendStatus(HttpResponseCodes.InternalServerError);
                return;
            }
            next();
        };
    }
}

export {GlobalErrorsMiddleware};
