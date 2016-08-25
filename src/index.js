import omit from 'lodash.omit';
import Proto from 'uberproto';
import filter from 'feathers-query-filters';
import errors from 'feathers-errors';
import * as utils from './utils';

class Service {
  constructor(options) {
    if (!options) {
      throw new Error('Sequelize options have to be provided');
    }

    if (!options.Model) {
      throw new Error('You must provide a Sequelize Model');
    }

    this.paginate = options.paginate || {};
    this.Model = options.Model;
    this.id = options.id || 'id';
  }

  extend(obj) {
    return Proto.extend(obj, this);
  }

  _find(params, getFilter = filter) {
    const { filters, query } = getFilter(params.query || {});
    const where = utils.getWhere(query);
    const order = utils.getOrder(filters.$sort);

    const q = Object.assign({
      where, order,
      limit: filters.$limit,
      offset: filters.$skip
    }, params.sequelize);

    if(filters.$select) {
      q.attributes = filters.$select;
    }

    return this.Model.findAndCount(q).then(result => {
      return {
        total: result.count,
        limit: filters.$limit,
        skip: filters.$skip || 0,
        data: result.rows
      };
    }).catch(utils.errorHandler);
  }

  find(params) {
    const paginate = (params && typeof params.paginate !== 'undefined') ?
      params.paginate : this.paginate;
    const result = this._find(params, where => filter(where, paginate));

    if(!paginate.default) {
      return result.then(page => page.data);
    }

    return result;
  }

  _get(id, params) {
    return this.Model.findById(id, params.sequelize).then(instance => {
      if(!instance) {
        throw new errors.NotFound(`No record found for id '${id}'`);
      }

      return instance;
    })
    .catch(utils.errorHandler);
  }

  // returns either the model intance for an id or all unpaginated
  // items for `params` if id is null
  _getOrFind(id, params) {
    if(id === null) {
      return this._find(params).then(page => page.data);
    }

    return this._get(id, params);
  }

  get(id, params) {
    return this._get(id, params);
  }

  create(data, params) {
    const options = params.sequelize || {};

    if (Array.isArray(data)) {
      return this.Model.bulkCreate(data, options).catch(utils.errorHandler);
    }

    return this.Model.create(data, options).catch(utils.errorHandler);
  }

  patch(id, data, params) {
    const where = Object.assign({}, params.query);

    if(id !== null) {
      where[this.id] = id;
    }

    const options = Object.assign({}, params.sequelize, { where });

    return this.Model.update(omit(data, this.id), options)
      .then(() => this._getOrFind(id, params))
      .catch(utils.errorHandler);
  }

  update(id, data, params) {
    const options = Object.assign({}, params.sequelize);

    if(Array.isArray(data)) {
      return Promise.reject('Not replacing multiple records. Did you mean `patch`?');
    }

    return this.Model.findById(id).then(instance => {
      if(!instance) {
        throw new errors.NotFound(`No record found for id '${id}'`);
      }

      let copy = {};
      Object.keys(instance.toJSON()).forEach(key => {
        if(typeof data[key] === 'undefined') {
          copy[key] = null;
        } else {
          copy[key] = data[key];
        }
      });

      return instance.update(copy, options);
    })
    .catch(utils.errorHandler);
  }

  remove(id, params) {
    return this._getOrFind(id, params).then(data => {
      const where = Object.assign({}, params.query);

      if(id !== null) {
        where[this.id] = id;
      }

      const options = Object.assign({}, params.sequelize, { where });

      return this.Model.destroy(options).then(() => data);
    })
    .catch(utils.errorHandler);
  }
}

export default function init(Model) {
  return new Service(Model);
}

init.Service = Service;
