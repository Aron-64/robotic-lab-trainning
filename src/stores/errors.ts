import { defineStore } from 'pinia'
import { ref } from 'vue'
export interface UserError { id:number; title:string; message:string; suggestion:string; code:string; demo:boolean }
export const useErrorsStore = defineStore('errors', () => {
 const errors = ref<UserError[]>([])
 let nextId=0
 function report(error:Omit<UserError,'id'>) {
  const existing=errors.value.find(item=>item.code===error.code && item.demo===error.demo)
  if(existing) return
  errors.value.unshift({...error,id:++nextId})
 }
 function dismiss(id:number) { errors.value=errors.value.filter(error=>error.id!==id) }
 function resetDemo() { errors.value=errors.value.filter(error=>!error.demo) }
 return {errors, report, dismiss, resetDemo}
})
