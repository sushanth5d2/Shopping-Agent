declare namespace chrome {
  namespace tabs {
    type Tab={title?:string,url?:string};
    function query(queryInfo:{active?:boolean,currentWindow?:boolean},callback:(tabs:Tab[])=>void):void;
  }
  namespace storage { namespace local { function set(items:Record<string,unknown>,callback?:()=>void):void; } }
}
