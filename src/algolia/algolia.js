/* eslint-disable no-alert, no-console */
import algoliasearch from 'algoliasearch'

// export `createAlgoliaClient` to use it in page components
export class AlgoliaClient {
  constructor(algoliaId, algoliaKey, PENNSIEVE_API_LOCATION = 'https://api.pennsieve.io') {
    this.client = algoliasearch(
      algoliaId,
      algoliaKey
    )
    this.PENNSIEVE_API_LOCATION = PENNSIEVE_API_LOCATION
  }
  initIndex(ALGOLIA_INDEX) {
    this.index = this.client.initIndex(ALGOLIA_INDEX);
  }

  getAlgoliaFacets(propPathMapping) {
    const map = new Map(Object.entries(propPathMapping));
    const facetPropPaths = Array.from(map.keys());
    let facetData = []
    let facetId = 0
    return this.index
      .search('', {
        sortFacetValuesBy: 'alpha',
        facets: facetPropPaths
      })
      .then(response => {
        facetPropPaths.map((facetPropPath) => {
          var children = []
          const responseFacets = response.facets
          if (responseFacets === undefined) { return }
          const responseFacetChildren =
            responseFacets[facetPropPath] == undefined
              ? {}
              : responseFacets[facetPropPath]
          Object.keys(responseFacetChildren).map(facet => {
            children.push({
              label: facet,
              id: facetId++,
              facetPropPath: facetPropPath
            })
          })
          if (children.length > 0) {
            facetData.push({
              label: map.get(facetPropPath),
              id: facetId++,
              children: children,
              key: facetPropPath
            })
          }
        })
        return facetData
      })
  }

  // Returns all DOIs of all versions for a given discover dataset
  _discoverAllDois(discoverId, PENNSIEVE_API_LOCATION = 'https://api.pennsieve.io') {
    return new Promise(resolve => {
      fetch(`${PENNSIEVE_API_LOCATION}/discover/datasets/${discoverId}/versions`).then(r => r.json()).then(dataset => {
        resolve(dataset.map(version => version.doi))
      })
    })
  }

  // Get all dois given a list of discoverIds
  _expandDois(discoverIds, PENNSIEVE_API_LOCATION = 'https://api.pennsieve.io') {
    return new Promise(resolve => {
      let promiseList = discoverIds.map(discoverId => this._discoverAllDois(discoverId, PENNSIEVE_API_LOCATION))
      Promise.all(promiseList).then((values) => {
        resolve(values.flat())
      });
    })
  }

  _processResultsForCards(results) {
    let newResults = []
    let newResult = {}
    for (let res of results) {
      newResult = { ...res }
      newResult = {
        doi: res.item.curie.split(':')[1],
        name: res.item.dataset.name,
        description: res.item.dataset.description,
        updated: res.pennsieve ? res.pennsieve.updatedAt : 'Unkown',
        publishDate: res.pennsieve? res.pennsieve.publishDate : 'Uknown',
        datasetId: res.objectID,
        detailsReady: false
      }
      newResults.push(newResult)
    }
    return newResults
  }

  _processAnatomy(hits) {
    let foundKeyWords = []
    let uniqueKeywords = []
    hits.forEach(hit => {
      if (hit.item && hit.item.keywords) {
        hit.item.keywords.forEach(keywordObj => {
          let keyword = keywordObj.keyword.toUpperCase()
          if (keyword.includes('UBERON') || keyword.includes('ILX')) {
            foundKeyWords.push(this._processUberonURL(keyword))
          }
        })
      }
      if (hit.anatomy && hit.anatomy.organ ) {
        hit.anatomy.organ.forEach(anatomy => {
          if (anatomy.curie) {
            foundKeyWords.push(anatomy.curie)
          }
        })
      }
    })
    uniqueKeywords = [...new Set(foundKeyWords)]
    return uniqueKeywords
  }

  _processUberonURL(url) {
    let ub = url.split('/').pop()
    return ub.replace('_', ':')
  }

  /**
   * Get Search results
   * This is using fetch from the Algolia API
   */
  search(filter, query = '', hitsperPage = 10, page = 1) {
    return new Promise(resolve => {
      this.index
        .search(query, {
          facets: ['*'],
          hitsPerPage: hitsperPage,
          page: page - 1,
          filters: filter,
          attributesToHighlight: [],
          // attributesToRetrieve: [
          //   'pennsieve.publishDate',
          //   'pennsieve.updatedAt',
          //   'item.curie',
          //   'item.name',
          //   'item.description',
          //   'objectID',
          // ],
        })
        .then(response => {
          let searchData = {
            items: this._processResultsForCards(response.hits),
            total: response.nbHits,
            discoverIds: response.hits.map(r => r.pennsieve ? r.pennsieve.identifier : undefined),
            dois: response.hits.map(r => r.item.curie.split(':')[1])
          }
          resolve(searchData)
        })
    })
  }

  /**
 * Get key words
 * This is used to return all keywords for a given search. Note that you often want the hits per page to be maxed out
 */
  anatomyInSearch(filter, query = '', hitsperPage = 999999, page = 1) {
    return new Promise(resolve => {
      this.index
        .search(query, {
          facets: ['*'],
          hitsPerPage: hitsperPage,
          page: page - 1,
          filters: filter,
          attributesToHighlight: [],
          attributesToRetrieve: [
            'item.keywords.keyword',
            'anatomy.organ.name',
            'anatomy.organ.curie'
          ],
        })
        .then(response => {
          let anatomyAsUberons = this._processAnatomy(response.hits)
          resolve(anatomyAsUberons)
        })
    })
  }
}
