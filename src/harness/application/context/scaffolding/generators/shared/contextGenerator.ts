import { FileMapper } from '../../../../../../utils/fileMapper';

export class ContextGenerator {
  constructor(protected readonly fileMapper: FileMapper) {}

  protected async loadFileContent(path: string): Promise<string> {
    return this.fileMapper.readFileContent(path);
  }
}
