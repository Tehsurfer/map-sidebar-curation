<template>
  <el-card :body-style="bodyStyle" class="content-card"> 
    <div slot="header" class="header">
      <context-card v-if="contextCardEntry" :entry="contextCardEntry"/>
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
    <SearchFilters class="filters" ref="filtersRef" :entry="filterEntry"
      :apiLocation="apiLocation" @filterResults="filterUpdate" @numberPerPage="numberPerPageUpdate"></SearchFilters>
    <div class="content scrollbar"  v-loading="loadingCards" ref="content">
      <div class="error-feedback" v-if="results.length === 0 && !loadingCards && !sciCrunchError">
          No results found - Please change your search / filter criteria.
      </div>
      <div class="error-feedback" v-if="sciCrunchError">{{sciCrunchError}}</div>
      <div v-for="o in results" :key="o.id" class="step-item">
        <DatasetCard :entry="o" :apiLocation="apiLocation"></DatasetCard>
      </div>
      <el-pagination
          class="pagination"
          :current-page.sync="page"
          hide-on-single-page
          large
          layout="prev, pager, next"
          :page-size="numberPerPage"
          :total="numberOfHits"
          @current-change="pageChange">
      </el-pagination>
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
  Pagination,
} from "element-ui";
import lang from "element-ui/lib/locale/lang/en";
import locale from "element-ui/lib/locale";
import SearchFilters from "./SearchFilters";
import DatasetCard from "./DatasetCard";
import ContextCard from './ContextCard.vue';

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
      let parse = await response.json()
      if (parse){
        throw new Error(parse.message)
      } else {
        throw new Error(response)
      }
    }
  return response;
}

var initial_state = {
      searchInput: "",
      lastSearchInput: "",
      lastSearch: "",
      results: [],
      drawerOpen: false,
      numberOfHits: 0,
      filter:{},
      filterFacet: undefined,
      loadingCards: false,
      numberPerPage: 10,
      page: 1,
      pageModel: 1,
      start: 0,
      hasSearched: false,
      sciCrunchError: false
}

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
      default: () => (initial_state)
    },
    contextCardEntry: {
      type: Object,
      default: undefined
    },
    apiLocation: {
      type: String,
      default: ""
    },
    firstSearch: {
      type: String,
      default: ""
    }
  },
  data: function () {
    return {
      ...this.entry,
      bodyStyle: {
        flex: "1 1 auto",
        "flex-flow": "column",
        display: "flex",
      }
    }
  },
  computed: {
    // This computed property populates filter data's entry object with $data from this sidebar
    filterEntry: function () {
      return {
        results: this.results,
        lastSearch: this.lastSearch,
        numberOfHits: this.numberOfHits,
        filterFacet: this.filterFacet
      };
    },
  },
  methods: {
    close: function () {
      this.drawerOpen = !this.drawerOpen;
      if(this.drawerOpen && !this.hasSearched){
        this.openSearch(this.searchInput);
      }
    },
    openSearch: function (search, filter=undefined) {
      this.drawerOpen = true;
      this.searchInput = search;
      this.resetPageNavigation()
      this.searchSciCrunch(search, filter);
      if (filter && filter[0]) {
        this.filterFacet = filter[0].facet;
        this.$refs.filtersRef.setCascader(filter[0].facet);
      }
    },
    clearSearchClicked: function(){
      this.searchInput = ''
      this.resetPageNavigation()
      this.searchSciCrunch(this.searchInput)
    },
    searchEvent: function (event = false) {
      if (event.keyCode === 13 || event instanceof MouseEvent) {
        this.resetPageNavigation()
        this.searchSciCrunch(this.searchInput);
      }
    },
    filterUpdate: function(filter){
      this.resetPageNavigation()
      this.searchSciCrunch(this.searchInput, filter);
      this.filter = filter
    },
    numberPerPageUpdate: function (val) {
      this.numberPerPage = val;
      this.pageChange(1);
    },
    pageChange: function(page){
      this.start = (page-1) * this.numberPerPage;
      this.searchSciCrunch(this.searchInput);
    },
    searchSciCrunch: function (search, filter=undefined) {
      this.lastSearchInput = search;
      this.loadingCards = true;
      this.results = [];
      this.disableCards();
      let params = this.createParams(filter, this.start, this.numberPerPage)
      this.callSciCrunch(this.apiLocation, this.searchEndpoint, search, params).then((result) => {
        //Only process if the search term is the same as the last search term.
        //This avoid old search being displayed.
        if (this.lastSearchInput == search) {
          this.sciCrunchError = false
          this.resultsProcessing(result)
          this.$refs.content.style['overflow-y'] = 'scroll'
        }
      }).catch((result) => {
        if (this.lastSearchInput == search) {
          this.sciCrunchError = result.message
        }
      }).finally(() => {
        if (this.lastSearchInput == search) {
          this.loadingCards = false
        }
      })
    },
    disableCards: function(){
      if(this.$refs.content){
        this.$refs.content.scroll({top:0, behavior:'smooth'})
        this.$refs.content.style['overflow-y'] = 'hidden'
      }
    },
    resetPageNavigation: function(){
      this.start = 0
      this.page = 1
    },
    createParams: function(filter, start, size){
      var params = {}
      if (filter !== undefined){
        params = filter
      } else {
         params = this.filter;
      }
      if(params.length > 0){
        for(let i in params){
          if(params[i].start){
            params[i].start = start
            params[i].size = size
          }
        }
      } else {
        params.start = start
        params.size = size
        params = [params]
      }
      return params
    },
    resultsProcessing: function (data) {
      this.lastSearch = this.searchInput
      this.results = [];
      let id = 0;
      this.numberOfHits = data.numberOfHits;
      if (data.results.length === 0){
        return
      }
      data.results.forEach((element) => {
        this.results.push({
          description: element.name,
          contributors: element.contributors,
          numberSamples: Array.isArray(element.samples)
            ? element.samples.length
            : 1,
          sexes: element.samples
            ? element.samples[0].sex
              ? [...new Set(element.samples.map((v) => v.sex.value))]
              : undefined
            : undefined, // This processing only includes each gender once into 'sexes'
          organs: (element.organs && element.organs.length > 0)
            ? [...new Set(element.organs.map((v) => v.name))]
            : undefined,
          ages: element.samples
            ? "ageCategory" in element.samples[0]
              ? [...new Set(element.samples.map((v) => v.ageCategory.value))]
              : undefined
            : undefined,
          updated: element.updated[0].timestamp.split("T")[0],
          url: element.uri[0],
          datasetId: element.identifier,
          csvFiles: element.csvFiles,
          id: id,
          doi: element.doi,
          scaffold: element.scaffolds ? true : false,
          scaffolds: element.scaffolds ? element.scaffolds : false
        });
        id++;
      });
    },
    createfilterParams: function(params){
      var paramsString = ''
      for(let param in params){
        paramsString += (new URLSearchParams(params[param])).toString()
        paramsString += '&'
      }
      paramsString = paramsString.slice(0, -1);
      return paramsString
    },
    callSciCrunch: function (apiLocation, searchEndpoint, search, params={}) {
      return new Promise((resolve, reject) => {
        var endpoint = apiLocation + searchEndpoint;
        // Add parameters if we are sent them
        if (search !== '' && Object.entries(params).length !== 0){
          endpoint = endpoint + search + '/?' + this.createfilterParams(params)
        } else {
          endpoint = endpoint + '?' + this.createfilterParams(params)
        }

        fetch(endpoint)
          .then(handleErrors)
          .then((response) => response.json())
          .then((data) => resolve(data))
          .catch((data) => reject(data))
      });
    },
  },
  mounted: function(){
    this.openSearch(this.firstSearch,[])
  },
  created: function () {
    //Create non-reactive local variables
    this.searchEndpoint = "filter-search/";
  },
};
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>

.content-card {
  height: 100%;
  flex-flow: column;
  display: flex;
}

.button{
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
  width: 298px!important;
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
  text-align:center;
}

.pagination>>>button{
  background-color: white !important;
}
.pagination>>>li{
  background-color: white !important;
}
.pagination>>>li.active{
  color: #8300bf;
}

.error-feedback{
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

>>> .el-input__suffix{
  padding-right: 10px;
}

>>> .my-drawer {
  background: rgba(0,0,0,0);
  box-shadow: none;
}

</style>