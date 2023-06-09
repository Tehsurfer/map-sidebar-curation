<template>
  <el-card :body-style="bodyStyle" class="content-card">
    <div slot="header" class="header">
      <context-card v-if="contextCardEntry && contextCardEnabled" :entry="contextCardEntry" :envVars="envVars"/>
      <el-input
        class="search-input"
        placeholder="Search"
        v-model="searchInput"
        @keyup.native="searchEvent"
        clearable
        @clear="clearSearchClicked"
      ></el-input>
      <el-button class="button" @click="searchEvent">Search</el-button>
    </div>
    <SearchFilters
      class="filters"
      ref="filtersRef"
      :entry="filterEntry"
      :envVars="envVars"
      @filterResults="filterUpdate"
      @numberPerPage="numberPerPageUpdate"
      @loading="filtersLoading"
      @cascaderReady="cascaderReady"
    ></SearchFilters>
    <div class="content scrollbar" v-loading="loadingCards" ref="content">
      <div
        class="error-feedback"
        v-if="results.length === 0 && !loadingCards"
      >No results found - Please change your search / filter criteria.</div>
      <div v-for="result in results" :key="result.doi" class="step-item">
        <DatasetCard :entry="result" :envVars="envVars" @contextUpdate="contextCardUpdate"></DatasetCard>
      </div>
      <el-pagination
        class="pagination"
        :current-page.sync="page"
        hide-on-single-page
        large
        layout="prev, pager, next"
        :page-size="numberPerPage"
        :total="numberOfHits"
        @current-change="pageChange"
      ></el-pagination>
    </div>
  </el-card>
</template>


<script>
/* eslint-disable no-alert, no-console */
import Vue from "vue";
import {
  Button,
  Card,
  Drawer,
  Icon,
  Input,
  Loading,
  Pagination
} from "element-ui";
import lang from "element-ui/lib/locale/lang/en";
import locale from "element-ui/lib/locale";
import SearchFilters from "./SearchFilters";
import DatasetCard from "./DatasetCard";
import ContextCard from "./ContextCard.vue";
import EventBus from "./EventBus"

import {AlgoliaClient} from "../algolia/algolia.js";
import {getFilters} from "../algolia/utils.js"

locale.use(lang);
Vue.use(Button);
Vue.use(Card);
Vue.use(Drawer);
Vue.use(Icon);
Vue.use(Input);
Vue.use(Loading);
Vue.use(Pagination);

// handleErrors: A custom fetch error handler to recieve messages from the server
//    even when an error is found
var handleErrors = async function(response) {
  if (!response.ok) {
    let parse = await response.json();
    if (parse) {
      throw new Error(parse.message);
    } else {
      throw new Error(response);
    }
  }
  return response;
};

var initial_state = {
  searchInput: "",
  lastSearch: "",
  results: [],
  numberOfHits: 0,
  filter: [],
  loadingCards: false,
  numberPerPage: 10,
  page: 1,
  pageModel: 1,
  "_dois": [],
  discoverIds: [],
  start: 0,
  hasSearched: false,
  contextCardEntry: undefined,
  contextCardEnabled: true,
};

export default {
  components: { SearchFilters, DatasetCard, ContextCard },
  name: "SideBarContent",
  props: {
    visible: {
      type: Boolean,
      default: false
    },
    isDrawer: {
      type: Boolean,
      default: true
    },
    entry: {
      type: Object,
      default: () => initial_state
    },
    envVars: {
      type: Object,
      default: () => {}
    },
  },
  data: function() {
    return {
      ...this.entry,
      bodyStyle: {
        flex: "1 1 auto",
        "flex-flow": "column",
        display: "flex"
      },
      cascaderIsReady: false,
    };
  },
  computed: {
    // This computed property populates filter data's entry object with $data from this sidebar
    filterEntry: function() {
      return {
        numberOfHits: this.numberOfHits,
        filterFacets: this.filter
      };
    }
  },
  methods: {
    contextCardUpdate: function(val){
        this.contextCardEntry = val
    },
    resetSearch: function() {
      this.numberOfHits = 0
      this.discoverIds = []
      this._dois = []
      this.results = []
      this.loadingCards = false
    },
    openSearch: function(filter, search='') {
      this.searchInput = search;
      this.resetPageNavigation();
      //Proceed normally if cascader is ready
      if (this.cascaderIsReady) {
        this.filter = this.$refs.filtersRef.getValidatedFilters(filter);
        //Facets provided but cannot find at least one valid
        //facet. Tell the users the search is invalid and reset
        //facets check boxes.
        if ((filter && filter.length > 0) && 
          (this.filter && this.filter.length === 0)) {
          this.$refs.filtersRef.checkShowAllBoxes();
          this.resetSearch();
        } else if (this.filter) {
          this.searchAlgolia(this.filter, search);
          this.$refs.filtersRef.setCascader(this.filter);
        }
      } else {
        //cascader is not ready, perform search if no filter is set,
        //otherwise waith for cascader to be ready
        this.filter = filter;
        if (!filter || filter.length == 0) {
          this.searchAlgolia(this.filter, search);
        }
      }
    },
    addFilter: function(filter) {
      if (this.cascaderIsReady) {
        this.resetPageNavigation();
        if (filter) {
          if (this.$refs.filtersRef.addFilter(filter))
            this.$refs.filtersRef.initiateSearch();
        }
      } else {
        if (Array.isArray(this.filter)) {
          this.filter.push(filter);
        } else {
          this.filter = [filter];
        }
      }
    },
    cascaderReady: function() {
      this.cascaderIsReady = true;
      this.openSearch(this.filter, this.searchInput);
    },
    clearSearchClicked: function() {
      this.searchInput = "";
      this.resetPageNavigation();
      this.searchAlgolia(this.filters, this.searchInput);
    },
    searchEvent: function(event = false) {
      if (event.keyCode === 13 || event instanceof MouseEvent) {
        this.resetPageNavigation();
        this.searchAlgolia(this.filters, this.searchInput);
      }
    },
    filterUpdate: function(filters) {
      this.filters = [...filters]
      this.resetPageNavigation()
      this.searchAlgolia(filters, this.searchInput)
      this.$emit("search-changed", {
        value: filters,
        type: "filter-update"
      });
    },
    searchAlgolia(filters, query=''){
      // Algolia search
      this.loadingCards = true
      this.algoliaClient.anatomyInSearch(getFilters(filters), query).then(anatomy => {
        EventBus.$emit("anatomyFound", anatomy) 
      })
      this.algoliaClient.search(getFilters(filters), query, this.numberPerPage, this.page).then(searchData => {
        this.numberOfHits = searchData.total
        this.discoverIds = searchData.discoverIds
        this._dois = searchData.dois
        this.results = searchData.items
        this.loadingCards = false
        this.scrollToTop()
        this.$emit("search-changed", { value: this.searchInput, type: "query-update" })
        if (this._abortController)
          this._abortController.abort()
        this._abortController = new AbortController()
        const signal = this._abortController.signal
        //Search ongoing, let the current flow progress
        this.perItemSearch(signal, { count: 0 })
      })
    },
    filtersLoading: function (val) {
      this.loadingCards = val;
    },
    numberPerPageUpdate: function(val) {
      this.numberPerPage = val;
      this.pageChange(1);
    },
    pageChange: function(page) {
      this.start = (page - 1) * this.numberPerPage;
      this.page = page
      this.searchAlgolia(this.filters, this.searchInput, this.numberPerPage, this.page)
    },
    handleMissingData: function(doi) {
      let i = this.results.findIndex(res=> res.doi === doi)
      if (this.results[i])
        this.results[i].detailsReady = true;
    },
    perItemSearch: function(signal, data) {
      //Maximum 10 downloads at once to prevent long waiting time
      //between unfinished search and new search
      const maxDownloads = 10;
      if (maxDownloads > data.count) {
        const id = this.discoverIds.shift();
        if (id) {
          data.count++;
          this.callSciCrunch(this.envVars.API_LOCATION, {'ids': id}, signal)
            .then(result => {
              if (result.numberOfHits === 0)
                this.handleMissingData(id);
              else
                this.resultsProcessing(result);
              this.$refs.content.style["overflow-y"] = "scroll";
              data.count--;
              //Async::Download finished, get the next one
              this.perItemSearch(signal, data);
            })
            .catch(result => {
              if (result.name !== 'AbortError') {
                this.handleMissingData(id);
                data.count--;
                //Async::Download not aborted, get the next one
                this.perItemSearch(signal, data);
              }
            });
            //Check and make another request until it gets to max downloads
            this.perItemSearch(signal, data);
        }
      }
    },
    scrollToTop: function() {
      if (this.$refs.content) {
        this.$refs.content.scroll({ top: 0, behavior: "smooth" });
      }
    },
    resetPageNavigation: function() {
      this.start = 0;
      this.page = 1;
    },
    resultsProcessing: function(data) {
      this.lastSearch = this.searchInput;

      if (data.results.length === 0) {
        return;
      }
      data.results.forEach(element => {
        // match the scicrunch result with algolia result
        let i = this.results.findIndex(res=> (res.datasetId === element.dataset_identifier) || (res.identifier === element.dataset_identifier))
        console.log('i: ', i)
        let name = this.results[i].name
        // Assign scicrunch results to the object
        Object.assign(this.results[i], element)
        this.results[i].name = name
        // Assign the attributes that need some processing
        Object.assign(this.results[i],{
          numberSamples: element.sampleSize
            ? parseInt(element.sampleSize)
            : 0,
          numberSubjects: element.subjectSize
            ? parseInt(element.subjectSize)
            : 0,
          updated: element.updated ? element.updated[0].timestamp.split("T")[0] : undefined,
          url: element.uri? element.uri[0] : undefined,
          datasetId: element.dataset_identifier,
          datasetRevision: element.dataset_revision,
          datasetVersion: element.dataset_version,
          organs: (element.organs && element.organs.length > 0)
              ? [...new Set(element.organs.map(v => v.name))]
              : undefined,
          species: element.organisms
            ? element.organisms[0].species
              ? [...new Set(element.organisms.map((v) =>v.species ? v.species.name : null))]
              : undefined
            : undefined, // This processing only includes each gender once into 'sexes'
          scaffolds: element['abi-scaffold-metadata-file'],
          thumbnails: element['abi-thumbnail'] ? element['abi-thumbnail']: element['abi-scaffold-thumbnail'],
          scaffoldViews: element['abi-scaffold-view-file'],
          videos: element.video,
          plots: element['abi-plot'],
          images: element['common-images'],
          contextualInformation: element['abi-contextual-information'].length > 0 ? element['abi-contextual-information'] : undefined,
          segmentation: element['mbf-segmentation'],
          simulation: element['abi-simulation-file'],
          additionalLinks: element.additionalLinks,
          detailsReady: true,
        })
        Vue.set(this.results, i, this.results[i])
      });
    },
    createfilterParams: function(params) {
      let p = new URLSearchParams();
      //Check if field is array or value
      for (const key in params) {
        if (Array.isArray(params[key])) {
          params[key].forEach(e => {
            p.append(key, e);
          });
        } else {
          p.append(key, params[key]);
        }
      }
      return p.toString();
    },
    callSciCrunch: function(apiLocation, params = {}, signal) {
      return new Promise((resolve, reject) => {
        // Add parameters if we are sent them
        let fullEndpoint = this.envVars.API_LOCATION + this.searchEndpoint + "?" + this.createfilterParams(params);
        fetch(fullEndpoint, {signal})
          .then(handleErrors)
          .then(response => response.json())
          .then(data => resolve(data))
          .catch(data => reject(data));
      });
    },
  },
  mounted: function() {
    // initialise algolia
    this.algoliaClient = new AlgoliaClient(this.envVars.ALGOLIA_ID, this.envVars.ALGOLIA_KEY, this.envVars.PENNSIEVE_API_LOCATION);
    this.algoliaClient.initIndex(this.envVars.ALGOLIA_INDEX);
    this.openSearch(undefined, '');
  },
  created: function() {
    //Create non-reactive local variables
    this.searchEndpoint = "dataset_info/using_pennsieveId/";
  }
};
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
.content-card {
  height: 100%;
  flex-flow: column;
  display: flex;
}

.button {
  background-color: #8300bf;
  border: #8300bf;
  color: white;
}

.step-item {
  font-size: 14px;
  margin-bottom: 18px;
  text-align: left;
}

.search-input {
  width: 298px !important;
  height: 40px;
  padding-right: 14px;
  align-items: left;
}

.header {
  border: solid 1px #292b66;
  background-color: #292b66;
  text-align: left;
}

.pagination {
  padding-bottom: 16px;
  background-color: white;
  text-align: center;
}

.pagination >>> button {
  background-color: white !important;
}
.pagination >>> li {
  background-color: white !important;
}
.pagination >>> li.active {
  color: #8300bf;
}

.error-feedback {
  font-family: Asap;
  font-size: 14px;
  font-style: italic;
  padding-top: 15px;
}

.content-card >>> .el-card__header {
  background-color: #292b66;
  border: solid 1px #292b66;
}

.content-card >>> .el-card__body {
  background-color: #f7faff;
  overflow-y: hidden;
}

.content {
  width: 518px;
  flex: 1 1 auto;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.06);
  border: solid 1px #e4e7ed;
  background-color: #ffffff;
  overflow-y: scroll;
  scrollbar-width: thin;
}

.content >>> .el-loading-spinner .path {
  stroke: #8300bf;
}

.content >>> .step-item:first-child .seperator-path{
   display: none;
}

.content >>> .step-item:not(:first-child) .seperator-path{
  width: 486px;
  height: 0px;
  border: solid 1px #e4e7ed;
  background-color: #e4e7ed;
}

.scrollbar::-webkit-scrollbar-track {
  border-radius: 10px;
  background-color: #f5f5f5;
}

.scrollbar::-webkit-scrollbar {
  width: 12px;
  right: -12px;
  background-color: #f5f5f5;
}

.scrollbar::-webkit-scrollbar-thumb {
  border-radius: 4px;
  box-shadow: 0 2px 4px 0 rgba(0, 0, 0, 0.06);
  background-color: #979797;
}

>>> .el-input__suffix {
  padding-right: 10px;
}

>>> .my-drawer {
  background: rgba(0, 0, 0, 0);
  box-shadow: none;
}
</style>
